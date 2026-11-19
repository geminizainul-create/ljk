/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import {
  OMRTemplate,
  ExamIdentity,
  QuestionConfig,
  BubbleCoordinate,
  RegistrationMark,
  PaperSize,
  PaperOrientation,
  PrintColorMode
} from '../types/ljk';

// Paper Dimensions in Millimeters
export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  F4: { width: 215, height: 330 },
  LEGAL: { width: 215.9, height: 355.6 }
};

export interface GenerateLjkOptions {
  exam: ExamIdentity;
  questions: QuestionConfig[];
  paperSize: PaperSize;
  orientation: PaperOrientation;
  studentIdGridEnabled?: boolean;
  studentIdDigits?: number;
  colorMode?: PrintColorMode;
}

export function generateLjkPdfAndTemplate(options: GenerateLjkOptions): {
  doc: jsPDF;
  template: OMRTemplate;
} {
  const {
    exam,
    questions,
    paperSize = 'A4',
    orientation = 'portrait',
    studentIdGridEnabled = true,
    studentIdDigits = 9,
    colorMode = 'bw' // Default Hitam Putih (Siap Fotokopi)
  } = options;

  const isBw = colorMode === 'bw';

  // Monochrome & Color Themes:
  // Mode BW dioptimalkan 100% untuk mesin fotokopi & stensil:
  // 1. Latar putih murni (255, 255, 255) tanpa raster/speckle halftone abu-abu yang membuat hasil fotokopi kotor/berbintik.
  // 2. Banner hitam solid (0, 0, 0) dengan teks putih tajam (255, 255, 255) menghasilkan densitas optik sempurna di mesin fotokopi.
  // 3. Garis bingkai hitam murni (0, 0, 0) menghasilkan ketajaman maksimal pada optik mesin fotokopi.
  // 4. Garis titik-titik (100, 100, 100) menjaga panduan menulis tetap terlihat jelas saat difotokopi tanpa mengaburkan tulisan tangan pensil/pulpen siswa.
  const theme = {
    // Header & Section Banners
    bannerFill: isBw ? [0, 0, 0] : [30, 41, 59],
    bannerFillSecondary: isBw ? [0, 0, 0] : [51, 65, 85],
    bannerFillTertiary: isBw ? [0, 0, 0] : [71, 85, 105],
    bannerFillMuted: isBw ? [0, 0, 0] : [100, 116, 139],
    bannerText: [255, 255, 255],

    // Title & Petunjuk Box
    boxFill: isBw ? [255, 255, 255] : [248, 250, 252],
    boxBorder: isBw ? [0, 0, 0] : [203, 213, 225],
    boxBorderDark: isBw ? [0, 0, 0] : [148, 163, 184],
    titleFill: isBw ? [255, 255, 255] : [245, 247, 250],
    titleBorder: isBw ? [0, 0, 0] : [30, 41, 59],

    // Card styling (Benar-Salah & Menjodohkan)
    cardBorder: isBw ? [0, 0, 0] : [203, 213, 225],
    cardHeaderFill: isBw ? [255, 255, 255] : [241, 245, 249],

    // Text colors
    textPrimary: [0, 0, 0],
    textSecondary: isBw ? [0, 0, 0] : [51, 65, 85],
    textMuted: isBw ? [70, 70, 70] : [71, 85, 105],
    footerText: isBw ? [70, 70, 70] : [100, 116, 139],

    // Writing lines & score boxes
    scoreBoxFill: isBw ? [255, 255, 255] : [241, 245, 249],
    scoreBoxBorder: isBw ? [0, 0, 0] : [148, 163, 184],
    dottedLine: isBw ? [100, 100, 100] : [203, 213, 225],
    marginGuide: isBw ? [140, 140, 140] : [226, 232, 240]
  };

  const dim = PAPER_DIMENSIONS[paperSize];
  const widthMm = orientation === 'portrait' ? dim.width : dim.height;
  const heightMm = orientation === 'portrait' ? dim.height : dim.width;

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true
  });

  const bubbleCoordinates: BubbleCoordinate[] = [];
  const registrationMarks: RegistrationMark[] = [];

  // Margins
  const marginX = 10;
  const marginY = 10;
  const contentWidth = widthMm - marginX * 2;
  const bottomLimit = heightMm - marginY - 10; // Safe bottom boundary before footer & bottom marks

  let currentPage = 1;

  // --- 1. REGISTRATION MARKS (4 PENANDA SUDUT PEMINDAIAN OMR) ---
  // Solid black registration squares (7x7mm) with 1.5mm inner white circle for ultra-precise CV homography detection
  const markSize = 7;
  const markOffset = 5; // distance from paper edge

  const drawTopRegistrationMarks = (page: number) => {
    // Outer black square (TL)
    doc.setFillColor(0, 0, 0);
    doc.rect(markOffset, markOffset, markSize, markSize, 'F');
    // Inner center white circle (1.5mm diameter)
    doc.setFillColor(255, 255, 255);
    doc.circle(markOffset + markSize / 2, markOffset + markSize / 2, 0.75, 'F');

    // Outer black square (TR)
    const trX = widthMm - markOffset - markSize;
    doc.setFillColor(0, 0, 0);
    doc.rect(trX, markOffset, markSize, markSize, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(trX + markSize / 2, markOffset + markSize / 2, 0.75, 'F');

    if (page === 1) {
      registrationMarks.push({
        corner: 'TL',
        x: markOffset,
        y: markOffset,
        size: markSize
      });
      registrationMarks.push({
        corner: 'TR',
        x: trX,
        y: markOffset,
        size: markSize
      });
    }
  };

  let bottomMarksDrawn = false;
  const drawBottomRegistrationMarks = (targetY?: number) => {
    if (bottomMarksDrawn) return;
    bottomMarksDrawn = true;

    const yPos = targetY !== undefined ? targetY : curY + 1.0;
    const blX = markOffset;
    const brX = widthMm - markOffset - markSize;

    // BL (Bottom-Left)
    doc.setFillColor(0, 0, 0);
    doc.rect(blX, yPos, markSize, markSize, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(blX + markSize / 2, yPos + markSize / 2, 0.75, 'F');

    // BR (Bottom-Right)
    doc.setFillColor(0, 0, 0);
    doc.rect(brX, yPos, markSize, markSize, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(brX + markSize / 2, yPos + markSize / 2, 0.75, 'F');

    registrationMarks.push({
      corner: 'BL',
      x: blX,
      y: Math.round(yPos * 100) / 100,
      size: markSize
    });
    registrationMarks.push({
      corner: 'BR',
      x: brX,
      y: Math.round(yPos * 100) / 100,
      size: markSize
    });

    // Garis penanda batas pemindaian OMR yang rapi & jelas
    doc.setDrawColor(theme.boxBorder[0], theme.boxBorder[1], theme.boxBorder[2]);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.line(marginX + 2, yPos + markSize / 2, widthMm - marginX - 2, yPos + markSize / 2);
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
    doc.text(
      '▲ BATAS AKHIR PEMINDAIAN OMR (OMR SCAN BOUNDARY) ▲',
      widthMm / 2,
      yPos + markSize / 2 - 1.2,
      { align: 'center' }
    );

    curY = yPos + markSize + 3.0;
  };

  const drawPageFooter = (pageNum: number) => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.setTextColor(theme.footerText[0], theme.footerText[1], theme.footerText[2]);
    doc.text(
      `LJK GENERATOR SMEPASDA • SMP Negeri 2 Pasirian • Halaman ${pageNum} • ${isBw ? 'Hitam Putih (Siap Fotokopi)' : 'Template OMR Standar'}`,
      widthMm / 2,
      heightMm - marginY + 3.5,
      { align: 'center' }
    );
  };

  // Gambar penanda sudut atas
  drawTopRegistrationMarks(1);

  // --- 2. HEADER KOP SURAT SEKOLAH ---
  let curY = marginY + 2;

  // Render logo sekolah pada sisi kiri kop surat jika logo diunggah
  if (exam.logoUrl) {
    try {
      const logoWidth = 16.5; // mm
      const logoHeight = 16.5; // mm
      const logoX = marginX + 2.5;
      const logoY = marginY + 0.5;
      let imgFormat = 'PNG';
      if (exam.logoUrl.includes('image/jpeg') || exam.logoUrl.includes('image/jpg')) {
        imgFormat = 'JPEG';
      } else if (exam.logoUrl.includes('image/webp')) {
        imgFormat = 'WEBP';
      }
      doc.addImage(exam.logoUrl, imgFormat, logoX, logoY, logoWidth, logoHeight, undefined, 'FAST');
    } catch (err) {
      console.warn('Gagal memuat logo kop surat ke PDF:', err);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(exam.pemerintah.toUpperCase(), widthMm / 2, curY, { align: 'center' });
  curY += 4;

  doc.setFontSize(9.5);
  doc.text(exam.dinas.toUpperCase(), widthMm / 2, curY, { align: 'center' });
  curY += 4.5;

  doc.setFontSize(12.5);
  doc.text(exam.namaSekolah.toUpperCase(), widthMm / 2, curY, { align: 'center' });
  curY += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`${exam.alamat} | NPSN: ${exam.npsn}`, widthMm / 2, curY, { align: 'center' });
  curY += 2;

  // Sesuai aturan tata naskah dinas terbaru: Kop surat tanpa garis pembatas bawah
  curY += 6.8;

  // Title Box
  doc.setFillColor(theme.titleFill[0], theme.titleFill[1], theme.titleFill[2]);
  doc.rect(marginX, curY - 2.5, contentWidth, 7, 'F');
  doc.setDrawColor(theme.titleBorder[0], theme.titleBorder[1], theme.titleBorder[2]);
  doc.setLineWidth(0.3);
  doc.rect(marginX, curY - 2.5, contentWidth, 7, 'S');

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `LEMBAR JAWABAN KOMPUTER (LJK) - ${exam.namaUjian.toUpperCase()} TP. ${exam.tahunPelajaran}`,
    widthMm / 2,
    curY + 2,
    { align: 'center' }
  );
  curY += 7.5;

  // --- 3. IDENTITAS PESERTA & STUDENT ID BUBBLE GRID ---
  const idBoxY = curY;
  const rowStepY = 4.4;
  const sidHeaderH = 5.2;
  const minGridHeight = sidHeaderH + 0.8 + studentIdDigits * rowStepY + 2.0;
  const idBoxHeight = studentIdGridEnabled ? Math.max(31, minGridHeight) : 31;
  const idInfoWidth = studentIdGridEnabled ? 108 : contentWidth;
  const gridWidth = contentWidth - idInfoWidth;

  // Left: Identity Fields
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, idBoxY, idInfoWidth, idBoxHeight, 'S');

  doc.setFontSize(7.5);
  const leftX = marginX + 3;
  const fieldStep = Math.min(7.5, Math.max(5.2, (idBoxHeight - 7.5) / 5));
  let textY = idBoxY + (idBoxHeight > 36 ? 6.5 : 4.5);

  const fields = [
    { label: 'Nama Peserta', val: ': ...................................................................' },
    { label: 'Kelas / Ruang', val: `: ${exam.kelas ? `${exam.kelas}  /  Ruang: ..........................................` : '.............  /  Ruang: ..........................................'}` },
    { label: 'Mata Pelajaran', val: `: ${exam.mataPelajaran || '.........................................'}` },
    { label: 'Hari / Tanggal', val: `: ${exam.hariTanggal || '.........................................'}` },
    { label: 'Tanda Tangan', val: ': [ ........................................... ]' }
  ];

  fields.forEach(f => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(f.label, leftX, textY);
    doc.setFont('helvetica', 'normal');
    doc.text(f.val, leftX + 22, textY);
    textY += fieldStep;
  });

  // Right: Nomor Peserta OMR Grid (if enabled)
  // Kotak digit disusun vertikal, sedangkan bulatan angka 0-9 disusun horizontal agar diameter bulatan besar (3.6mm) dan mudah dihitamkan!
  const sidBubbleRadius = 1.8; // mm (diameter 3.6mm, nyaman & akurat untuk pensil 2B)
  if (studentIdGridEnabled) {
    const gridX = marginX + idInfoWidth;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(gridX, idBoxY, gridWidth, idBoxHeight, 'S');

    // Header bar NOMOR PESERTA
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text('NOMOR PESERTA', gridX + gridWidth / 2, idBoxY + 3.7, { align: 'center' });
    doc.line(gridX, idBoxY + sidHeaderH, gridX + gridWidth, idBoxY + sidHeaderH);

    // Posisi horizontal kotak tulis digit (kiri) & 10 bulatan 0-9 (kanan)
    const boxLeftX = gridX + 2.5;
    const boxW = 5.6;
    const boxH = 3.7;
    const firstBubbleX = boxLeftX + boxW + 4.9;
    const stepX = Math.min(7.2, (gridWidth - (boxW + 9.9)) / 9);
    const startRowCenterY = idBoxY + sidHeaderH + 0.8 + rowStepY / 2;

    for (let d = 0; d < studentIdDigits; d++) {
      const rowCenterY = startRowCenterY + d * rowStepY;

      // Kotak tulis angka digit disusun vertikal dari atas ke bawah
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.22);
      doc.rect(boxLeftX, rowCenterY - boxH / 2, boxW, boxH, 'S');

      // 10 bulatan angka 0-9 disusun horizontal ke kanan
      for (let num = 0; num <= 9; num++) {
        const bX = firstBubbleX + num * stepX;
        doc.setLineWidth(0.2);
        doc.setDrawColor(0, 0, 0);
        doc.circle(bX, rowCenterY, sidBubbleRadius, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.8);
        doc.setTextColor(0, 0, 0);
        doc.text(num.toString(), bX, rowCenterY + 0.68, { align: 'center' });

        // Register bubble for student ID
        bubbleCoordinates.push({
          id: `SID-${d}-${num}`,
          questionNumber: 9990 + d,
          type: 'PG',
          option: num.toString(),
          subItemIndex: d,
          page: 1,
          x: Math.round(bX * 100) / 100,
          y: Math.round(rowCenterY * 100) / 100,
          radius: sidBubbleRadius
        });
      }
    }
  }

  curY = idBoxY + idBoxHeight + 2;

  // --- 4. PETUNJUK PENGISIAN BOX (Desain Bebas Tumpukan Teks dengan Ilustrasi Vektor Murni) ---
  const petunjukHeight = 13.5;
  doc.setFillColor(theme.boxFill[0], theme.boxFill[1], theme.boxFill[2]);
  doc.setDrawColor(theme.boxBorder[0], theme.boxBorder[1], theme.boxBorder[2]);
  doc.setLineWidth(0.25);
  doc.rect(marginX, curY, contentWidth, petunjukHeight, 'F');
  doc.rect(marginX, curY, contentWidth, petunjukHeight, 'S');

  // Judul Petunjuk
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
  doc.text('PETUNJUK PENGISIAN:', marginX + 3, curY + 3.6);

  // Kolom 1 (Aturan 1 & 2)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
  doc.text('1. Gunakan pensil 2B untuk menghitamkan bulatan.', marginX + 3, curY + 7.2);
  doc.text('2. Hitamkan bulatan penuh sampai rata.', marginX + 3, curY + 11.0);

  // Kolom 2 (Aturan 3 & 4) - Posisi dinamis sesuai lebar kertas
  const petunjukCol2X = marginX + Math.min(80, contentWidth * 0.42);
  doc.text('3. Hapus sebersih mungkin bila ingin mengganti jawaban.', petunjukCol2X, curY + 7.2);
  doc.text('4. Lembar jawaban tidak boleh kotor, terlipat, atau basah.', petunjukCol2X, curY + 11.0);

  // Kolom 3 (Ilustrasi Visual Vektor - Bebas bug Unicode & Tidak Akan Bertumpuk)
  const contohBoxX = marginX + contentWidth - 56;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
  doc.text('Contoh Pengisian:', contohBoxX, curY + 3.6);

  // Label Benar & Bulatan Penuh (Vektor)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(0, 0, 0);
  doc.text('Benar:', contohBoxX, curY + 8.2);

  doc.setFillColor(0, 0, 0);
  doc.circle(contohBoxX + 11, curY + 7.8, 1.5, 'F');

  // Label Salah & Contoh Bulatan Salah (Vektor Silang, Centang, Titik)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
  doc.text('Salah:', contohBoxX + 18, curY + 8.2);

  // Bulatan Silang
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.circle(contohBoxX + 27, curY + 7.8, 1.5, 'S');
  doc.line(contohBoxX + 26.1, curY + 6.9, contohBoxX + 27.9, curY + 8.7);
  doc.line(contohBoxX + 26.1, curY + 8.7, contohBoxX + 27.9, curY + 6.9);

  // Bulatan Centang
  doc.circle(contohBoxX + 34, curY + 7.8, 1.5, 'S');
  doc.line(contohBoxX + 33.1, curY + 7.8, contohBoxX + 33.8, curY + 8.7);
  doc.line(contohBoxX + 33.8, curY + 8.7, contohBoxX + 34.9, curY + 6.9);

  // Bulatan Titik / Kecil
  doc.circle(contohBoxX + 41, curY + 7.8, 1.5, 'S');
  doc.setFillColor(0, 0, 0);
  doc.circle(contohBoxX + 41, curY + 7.8, 0.45, 'F');

  curY += petunjukHeight + 3.0;

  // --- 5. RENDER QUESTION SECTIONS ---
  const bubbleRadius = 1.85; // mm (diameter 3.7mm)
  const optSpacing = 5.2; // mm between A, B, C, D

  // Helper to draw a single bubble with page tracking
  const drawBubble = (
    qNum: number,
    optText: string,
    x: number,
    y: number,
    type: any,
    subIdx?: number
  ) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.circle(x, y, bubbleRadius, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0);
    doc.text(optText, x, y + 0.7, { align: 'center' });

    bubbleCoordinates.push({
      id: `Q${qNum}-${optText}${subIdx !== undefined ? `-${subIdx}` : ''}`,
      questionNumber: qNum,
      type,
      option: optText,
      subItemIndex: subIdx,
      page: currentPage,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      radius: bubbleRadius
    });
  };

  // Helper for dynamic page break if a section would exceed the printable area
  const checkPageBreak = (neededHeight: number): boolean => {
    if (curY + neededHeight > bottomLimit) {
      drawPageFooter(currentPage);
      doc.addPage([widthMm, heightMm], orientation);
      currentPage++;
      if (!bottomMarksDrawn) {
        drawTopRegistrationMarks(currentPage);
      }
      curY = marginY + 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
      doc.text(
        `LEMBAR JAWABAN KOMPUTER (LJK) - HALAMAN ${currentPage} - ${exam.namaSekolah.toUpperCase()}`,
        widthMm / 2,
        curY,
        { align: 'center' }
      );
      curY += 5;
      return true;
    }
    return false;
  };

  // Check which sections are enabled
  const pgConfig = questions.find(q => q.type === 'PG' && q.enabled);
  const pgkConfig = questions.find(q => q.type === 'PG_KOMPLEKS' && q.enabled);
  const bsConfig = questions.find(q => q.type === 'BENAR_SALAH' && q.enabled);
  const matchConfig = questions.find(q => q.type === 'MENJODOHKAN' && q.enabled);
  const essayShortConfig = questions.find(q => q.type === 'URAIAN_SINGKAT' && q.enabled);
  const essayLongConfig = questions.find(q => q.type === 'URAIAN_PANJANG' && q.enabled);

  // Common multi-column metrics helper (supports 1 to 5 columns, default 3)
  const sectionColGap = 4.0;
  const getSectionColMetrics = (totalItems: number, requestedCols = 3) => {
    const safeCols = Math.min(5, Math.max(1, requestedCols || 3));
    const numCols = Math.min(safeCols, Math.max(1, totalItems));
    const colGap = numCols >= 5 ? 3.0 : numCols === 4 ? 3.5 : sectionColGap;
    const colWidth = (contentWidth - (numCols - 1) * colGap) / numCols;
    const itemsPerCol = Math.ceil(totalItems / numCols);
    return { numCols, colWidth, itemsPerCol, colGap };
  };

  // SECTION A: PILIHAN GANDA (Format 1-5 Kolom Fleksibel)
  if (pgConfig && pgConfig.numbers.length > 0) {
    const totalPg = pgConfig.numbers.length;
    const { numCols, colWidth, itemsPerCol, colGap } = getSectionColMetrics(totalPg, pgConfig.columnsCount || 3);
    const rowHeight = 4.9; // mm (radius 1.85mm -> diameter 3.7mm, leaving 1.2mm gap)
    const sectionHeight = 5.5 + itemsPerCol * rowHeight + 2.5;

    checkPageBreak(sectionHeight);

    doc.setFillColor(theme.bannerFill[0], theme.bannerFill[1], theme.bannerFill[2]);
    doc.setTextColor(theme.bannerText[0], theme.bannerText[1], theme.bannerText[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.rect(marginX, curY, contentWidth, 4.5, 'F');
    doc.text(`BAGIAN A. PILIHAN GANDA (Format ${numCols} Kolom - ${pgConfig.numbers.length} Soal)`, marginX + 3, curY + 3.2);
    curY += 5.5;

    const options = ['A', 'B', 'C', 'D', 'E'].slice(0, pgConfig.optionsCount || 4);
    const isCompactFiveCol = numCols >= 5;
    const numRightX = isCompactFiveCol ? 4.2 : 4.5;
    const firstBubbleX = isCompactFiveCol ? (options.length >= 5 ? 8.2 : 9.0) : 9.5;
    const itemOptSpacing = isCompactFiveCol ? (options.length >= 5 ? 4.9 : 5.0) : optSpacing;

    const startY = curY;
    pgConfig.numbers.forEach((qNum, idx) => {
      const col = Math.floor(idx / itemsPerCol);
      const row = idx % itemsPerCol;
      const itemX = marginX + col * (colWidth + colGap);
      const itemY = startY + row * rowHeight + 2;

      // Question Number (right aligned)
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isCompactFiveCol ? 6.5 : 7);
      doc.text(`${qNum}.`, itemX + numRightX, itemY + 0.8, { align: 'right' });

      // Bubbles A, B, C, D (and E if optionsCount = 5)
      options.forEach((opt, oIdx) => {
        const bX = itemX + firstBubbleX + oIdx * itemOptSpacing;
        drawBubble(qNum, opt, bX, itemY, 'PG');
      });
    });

    curY = startY + itemsPerCol * rowHeight + 2.5;
  }

  // SECTION B: PG KOMPLEKS (Format 1-5 Kolom Fleksibel)
  if (pgkConfig && pgkConfig.numbers.length > 0) {
    const totalPgk = pgkConfig.numbers.length;
    const { numCols, colWidth, itemsPerCol, colGap } = getSectionColMetrics(totalPgk, pgkConfig.columnsCount || 3);
    const rowHeight = 4.9;
    const sectionHeight = 5.5 + itemsPerCol * rowHeight + 2.5;

    checkPageBreak(sectionHeight);

    doc.setFillColor(theme.bannerFillSecondary[0], theme.bannerFillSecondary[1], theme.bannerFillSecondary[2]);
    doc.setTextColor(theme.bannerText[0], theme.bannerText[1], theme.bannerText[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.rect(marginX, curY, contentWidth, 4.5, 'F');
    doc.text(
      `BAGIAN B. PILIHAN GANDA KOMPLEKS (Format ${numCols} Kolom - ${pgkConfig.numbers.length} Soal)`,
      marginX + 3,
      curY + 3.2
    );
    curY += 5.5;

    const isCompactFiveCol = numCols >= 5;
    const numRightX = isCompactFiveCol ? 4.2 : 4.5;
    const firstBubbleX = isCompactFiveCol ? 8.8 : 9.5;
    const itemOptSpacing = isCompactFiveCol ? 5.0 : optSpacing;

    const startY = curY;
    pgkConfig.numbers.forEach((qNum, idx) => {
      const col = Math.floor(idx / itemsPerCol);
      const row = idx % itemsPerCol;
      const itemX = marginX + col * (colWidth + colGap);
      const itemY = startY + row * rowHeight + 2;

      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isCompactFiveCol ? 6.5 : 7);
      doc.text(`${qNum}.`, itemX + numRightX, itemY + 0.8, { align: 'right' });

      const options = ['A', 'B', 'C', 'D'];
      options.forEach((opt, oIdx) => {
        const bX = itemX + firstBubbleX + oIdx * itemOptSpacing;
        drawBubble(qNum, opt, bX, itemY, 'PG_KOMPLEKS');
      });
    });

    curY = startY + itemsPerCol * rowHeight + 2.5;
  }

  // SECTION C: BENAR - SALAH (Format 1-5 Kolom Fleksibel dengan Kartu Terstruktur)
  if (bsConfig && bsConfig.numbers.length > 0) {
    const subCount = bsConfig.subItemsCount || 3;
    const statements = ['A', 'B', 'C', 'D', 'E'].slice(0, subCount);
    const totalBs = bsConfig.numbers.length;
    const { numCols, colWidth, itemsPerCol, colGap } = getSectionColMetrics(totalBs, bsConfig.columnsCount || 3);
    // Tinggi kartu: header (4.2mm) + statements (statements.length * 4.6mm) + buffer bawah (2.6mm)
    const cardHeight = 4.2 + statements.length * 4.6 + 2.6;
    const rowHeight = cardHeight + 2.2;
    const sectionHeight = 5.5 + itemsPerCol * rowHeight + 2.5;

    checkPageBreak(sectionHeight);

    doc.setFillColor(theme.bannerFillTertiary[0], theme.bannerFillTertiary[1], theme.bannerFillTertiary[2]);
    doc.setTextColor(theme.bannerText[0], theme.bannerText[1], theme.bannerText[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.rect(marginX, curY, contentWidth, 4.5, 'F');
    doc.text(
      `BAGIAN C. BENAR - SALAH (Format ${numCols} Kolom - ${bsConfig.numbers.length} Soal)`,
      marginX + 3,
      curY + 3.2
    );
    curY += 5.5;

    // Posisi dinamis kolom B dan S menyesuaikan lebar kolom agar tidak meluber di 4/5 kolom
    const rightPad = colWidth < 42 ? 3.8 : colWidth < 52 ? 5.5 : colWidth < 70 ? 11.5 : 14.0;
    const bsGap = colWidth < 42 ? 7.2 : colWidth < 52 ? 9.0 : colWidth < 70 ? 12.0 : 14.0;
    const padLeft = colWidth < 45 ? 1.8 : 2.5;
    const showPernyataanHeader = colWidth >= 52;

    const startY = curY;
    bsConfig.numbers.forEach((qNum, idx) => {
      const col = Math.floor(idx / itemsPerCol);
      const row = idx % itemsPerCol;
      const itemX = marginX + col * (colWidth + colGap);
      const cardY = startY + row * rowHeight + 1.0;

      const sCenterX = itemX + colWidth - rightPad;
      const bCenterX = sCenterX - bsGap;

      // Bingkai kartu
      doc.setDrawColor(theme.cardBorder[0], theme.cardBorder[1], theme.cardBorder[2]);
      doc.setLineWidth(0.2);
      doc.roundedRect(itemX, cardY, colWidth, cardHeight, 1.2, 1.2, 'S');

      // Header kartu
      doc.setFillColor(theme.cardHeaderFill[0], theme.cardHeaderFill[1], theme.cardHeaderFill[2]);
      doc.roundedRect(itemX, cardY, colWidth, 4.0, 1.2, 1.2, 'F');
      doc.rect(itemX, cardY + 2.4, colWidth, 1.6, 'F');
      if (isBw) {
        doc.setDrawColor(0, 0, 0);
        doc.line(itemX, cardY + 4.0, itemX + colWidth, cardY + 4.0);
      }

      doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(colWidth < 45 ? 6.0 : 6.8);
      doc.text(`Soal ${qNum}:`, itemX + padLeft, cardY + 2.8);

      doc.setFontSize(5.8);
      doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
      if (showPernyataanHeader) {
        doc.text('Pernyataan', itemX + (colWidth >= 85 ? 20 : 16), cardY + 2.8);
      }
      doc.text('B', bCenterX, cardY + 2.8, { align: 'center' });
      doc.text('S', sCenterX, cardY + 2.8, { align: 'center' });

      let stmtY = cardY + 4.2 + 2.6;
      statements.forEach((_, sIdx) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(colWidth < 45 ? 5.6 : 6.2);
        doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
        const stmtLabel = `Pernyataan ${sIdx + 1}`;
        doc.text(stmtLabel, itemX + padLeft, stmtY + 0.6);

        // Benar bubble
        drawBubble(qNum, 'B', bCenterX, stmtY, 'BENAR_SALAH', sIdx);

        // Salah bubble
        drawBubble(qNum, 'S', sCenterX, stmtY, 'BENAR_SALAH', sIdx);

        stmtY += 4.6;
      });
    });

    curY = startY + itemsPerCol * rowHeight + 2.5;
  }

  // SECTION D: MENJODOHKAN (Format 3 Kolom Efisien Kertas dengan Kartu Terstruktur)
  if (matchConfig && matchConfig.numbers.length > 0) {
    const pairsCount = matchConfig.subItemsCount || 4;
    const pairs = Array.from({ length: pairsCount }, (_, i) => i + 1);
    const totalMatch = matchConfig.numbers.length;
    const { colWidth, itemsPerCol } = getSectionColMetrics(totalMatch, 3);
    const optHeaders = ['A', 'B', 'C', 'D', 'E'];
    const optColSpacing = 5.0; // 5 pilihan (A-E)
    const headerHeight = 4.8;
    const cardHeight = headerHeight + pairs.length * 4.5 + 2.4;
    const rowHeight = cardHeight + 2.2;
    const sectionHeight = 5.5 + itemsPerCol * rowHeight + 2.5;

    checkPageBreak(sectionHeight);

    doc.setFillColor(theme.bannerFillTertiary[0], theme.bannerFillTertiary[1], theme.bannerFillTertiary[2]);
    doc.setTextColor(theme.bannerText[0], theme.bannerText[1], theme.bannerText[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.rect(marginX, curY, contentWidth, 4.5, 'F');
    doc.text(
      `BAGIAN D. MENJODOHKAN (Format 3 Kolom - ${matchConfig.numbers.length} Soal)`,
      marginX + 3,
      curY + 3.2
    );
    curY += 5.5;

    const startY = curY;
    matchConfig.numbers.forEach((qNum, idx) => {
      const col = Math.floor(idx / itemsPerCol);
      const row = idx % itemsPerCol;
      const itemX = marginX + col * (colWidth + sectionColGap);
      const cardY = startY + row * rowHeight + 1.0;

      // Bingkai kartu rapi 3 kolom
      doc.setDrawColor(theme.cardBorder[0], theme.cardBorder[1], theme.cardBorder[2]);
      doc.setLineWidth(0.2);
      doc.roundedRect(itemX, cardY, colWidth, cardHeight, 1.2, 1.2, 'S');

      // Header kartu
      doc.setFillColor(theme.cardHeaderFill[0], theme.cardHeaderFill[1], theme.cardHeaderFill[2]);
      doc.roundedRect(itemX, cardY, colWidth, 4.0, 1.2, 1.2, 'F');
      doc.rect(itemX, cardY + 2.4, colWidth, 1.6, 'F');
      if (isBw) {
        doc.setDrawColor(0, 0, 0);
        doc.line(itemX, cardY + 4.0, itemX + colWidth, cardY + 4.0);
      }

      doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.text(`Soal ${qNum}:`, itemX + 2.5, cardY + 2.8);

      // Label kolom opsi A, B, C, D, E tepat di atas bulatan
      const optStartX = itemX + 20.5;
      doc.setFontSize(5.8);
      doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
      optHeaders.forEach((h, hIdx) => {
        doc.text(h, optStartX + hIdx * optColSpacing, cardY + 2.8, { align: 'center' });
      });

      let pairY = cardY + headerHeight + 2.4;
      pairs.forEach((pairNum, pIdx) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
        doc.text(`Item ${pairNum}.`, itemX + 2.5, pairY + 0.6);

        optHeaders.forEach((opt, oIdx) => {
          const bX = optStartX + oIdx * optColSpacing;
          drawBubble(qNum, opt, bX, pairY, 'MENJODOHKAN', pIdx);
        });

        pairY += 4.5;
      });
    });

    curY = startY + itemsPerCol * rowHeight + 2.5;
  }

  // --- 2 KOTAK PENANDA BATASAN BAWAH SCAN (Ditempatkan Tepat SEBELUM Soal Uraian Pendek) ---
  drawBottomRegistrationMarks();

  // SECTION E: URAIAN SINGKAT (Format 2 Kolom Efisien Kertas untuk Jawaban Pendek)
  if (essayShortConfig && essayShortConfig.numbers.length > 0) {
    const totalShort = essayShortConfig.numbers.length;
    const numCols = Math.min(2, Math.max(1, totalShort));
    const colGap = 4.0; // mm
    const colWidth = (contentWidth - (numCols - 1) * colGap) / numCols;
    const totalRows = Math.ceil(totalShort / numCols);
    const boxHeight = 13.5; // mm per soal jawaban singkat
    const rowGap = 2.5;
    const sectionHeight = 6.0 + totalRows * (boxHeight + rowGap);
    checkPageBreak(Math.min(sectionHeight, boxHeight + 8));

    doc.setFillColor(theme.bannerFillMuted[0], theme.bannerFillMuted[1], theme.bannerFillMuted[2]);
    doc.setTextColor(theme.bannerText[0], theme.bannerText[1], theme.bannerText[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.rect(marginX, curY, contentWidth, 4.5, 'F');
    doc.text(
      `BAGIAN E. URAIAN SINGKAT (Format 2 Kolom - ${essayShortConfig.numbers.length} Soal)`,
      marginX + 3,
      curY + 3.2
    );
    curY += 6.0;

    // Render baris demi baris dalam format 2 kolom
    for (let r = 0; r < totalRows; r++) {
      if (curY + boxHeight + 3 > bottomLimit) {
        checkPageBreak(boxHeight + 8);
      }

      for (let c = 0; c < numCols; c++) {
        const idx = r * numCols + c;
        if (idx >= totalShort) break;

        const qNum = essayShortConfig.numbers[idx];
        const itemX = marginX + c * (colWidth + colGap);

        // Kotak jawaban singkat per kolom
        doc.setDrawColor(theme.boxBorderDark[0], theme.boxBorderDark[1], theme.boxBorderDark[2]);
        doc.setLineWidth(0.25);
        doc.rect(itemX, curY, colWidth, boxHeight, 'S');

        // Pita header kotak soal
        doc.setFillColor(theme.boxFill[0], theme.boxFill[1], theme.boxFill[2]);
        doc.rect(itemX, curY, colWidth, 4.2, 'F');
        doc.setDrawColor(theme.boxBorderDark[0], theme.boxBorderDark[1], theme.boxBorderDark[2]);
        doc.line(itemX, curY + 4.2, itemX + colWidth, curY + 4.2);

        doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.text(`No. ${qNum}. Jawaban Singkat:`, itemX + 2.5, curY + 3.0);

        // Kolom skor penilaian guru di sisi kanan kotak
        const scoreBoxWidth = 26;
        doc.setFillColor(theme.scoreBoxFill[0], theme.scoreBoxFill[1], theme.scoreBoxFill[2]);
        doc.rect(itemX + colWidth - scoreBoxWidth, curY, scoreBoxWidth, 4.2, 'F');
        doc.setDrawColor(theme.scoreBoxBorder[0], theme.scoreBoxBorder[1], theme.scoreBoxBorder[2]);
        doc.rect(itemX + colWidth - scoreBoxWidth, curY, scoreBoxWidth, 4.2, 'S');
        doc.setFontSize(5.8);
        doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
        doc.text(
          `Skor: [ ___ / ${essayShortConfig.pointsPerItem || 10} ]`,
          itemX + colWidth - scoreBoxWidth / 2,
          curY + 2.9,
          { align: 'center' }
        );

        // Garis titik-titik penulisan jawaban singkat
        doc.setDrawColor(theme.dottedLine[0], theme.dottedLine[1], theme.dottedLine[2]);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(itemX + 3, curY + 8.0, itemX + colWidth - 3, curY + 8.0);
        doc.line(itemX + 3, curY + 11.6, itemX + colWidth - 3, curY + 11.6);
        doc.setLineDashPattern([], 0);
      }

      curY += boxHeight + rowGap;
    }
  }

  // SECTION F: URAIAN PANJANG (Lembar Bergaris Titik-Titik Penuh Tanpa Frame Kotak - Bebas Pengisian Nomor Soal)
  if (essayLongConfig && essayLongConfig.numbers.length > 0) {
    // Pastikan penanda bawah scan sudah tergambar jika Bagian E tidak aktif
    drawBottomRegistrationMarks();

    const numbersListStr = essayLongConfig.numbers.join(', ');

    // Jika sisa ruang pada halaman saat ini kurang dari 45mm, pindah ke halaman baru
    // sehingga lembar titik-titik uraian panjang mendapatkan ruang maksimal sampai batas kertas
    if (bottomLimit - curY < 45) {
      checkPageBreak(50);
    }

    // 1. Pita Judul Bagian F
    doc.setFillColor(theme.bannerFillMuted[0], theme.bannerFillMuted[1], theme.bannerFillMuted[2]);
    doc.setTextColor(theme.bannerText[0], theme.bannerText[1], theme.bannerText[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.rect(marginX, curY, contentWidth, 4.5, 'F');
    doc.text(
      `BAGIAN F. LEMBAR JAWABAN URAIAN PANJANG (Nomor Soal: ${numbersListStr})`,
      marginX + 3,
      curY + 3.2
    );
    curY += 5.2;

    // 2. Sub-bar Petunjuk Pengisian Bebas Mandiri oleh Siswa
    doc.setFillColor(theme.boxFill[0], theme.boxFill[1], theme.boxFill[2]);
    doc.rect(marginX, curY, contentWidth, 4.5, 'F');
    doc.setDrawColor(theme.boxBorder[0], theme.boxBorder[1], theme.boxBorder[2]);
    doc.setLineWidth(0.2);
    doc.rect(marginX, curY, contentWidth, 4.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
    doc.text('Petunjuk:', marginX + 3, curY + 3.1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.0);
    doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
    doc.text(
      `Tuliskan nomor soal (misal: ${numbersListStr}) dan uraian/penyelesaian jawaban secara bebas dan rapi pada lembar bergaris titik-titik di bawah ini.`,
      marginX + 15,
      curY + 3.1
    );
    curY += 5.8;

    // 3. Rubrik Penilaian Nilai / Skor Guru di bagian atas lembar titik-titik
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.0);
    doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
    doc.text('Rubrik Skor Guru:', marginX + 2, curY + 3.0);

    const maxItemsInRow = 6;
    if (essayLongConfig.numbers.length <= maxItemsInRow) {
      let rX = marginX + 26;
      essayLongConfig.numbers.forEach((num) => {
        doc.setDrawColor(theme.scoreBoxBorder[0], theme.scoreBoxBorder[1], theme.scoreBoxBorder[2]);
        doc.setFillColor(theme.scoreBoxFill[0], theme.scoreBoxFill[1], theme.scoreBoxFill[2]);
        doc.setLineWidth(0.2);
        doc.rect(rX, curY + 0.2, 21, 3.8, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.6);
        doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
        doc.text(`No. ${num}: [   ]`, rX + 1.8, curY + 2.8);
        rX += 22.5;
      });

      // Kotak Total Nilai
      doc.setDrawColor(theme.scoreBoxBorder[0], theme.scoreBoxBorder[1], theme.scoreBoxBorder[2]);
      doc.setFillColor(theme.scoreBoxFill[0], theme.scoreBoxFill[1], theme.scoreBoxFill[2]);
      doc.setLineWidth(0.2);
      doc.rect(rX, curY + 0.2, 28, 3.8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.6);
      doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
      doc.text('Total: [      / 100 ]', rX + 2.0, curY + 2.8);
    } else {
      // Jika jumlah butir banyak, tampilkan format baris ringkas
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.0);
      doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
      doc.text(
        `Skor Tiap Butir: [ _______ / ${essayLongConfig.pointsPerItem || 20} ]    |    Total Nilai Uraian: [ _______ / 100 ]`,
        marginX + 28,
        curY + 3.0
      );
    }
    curY += 5.8;

    // 4. Garis panduan batas kiri (margin paragraf vertikal seperti kertas ujian bergaris)
    doc.setDrawColor(theme.marginGuide[0], theme.marginGuide[1], theme.marginGuide[2]);
    doc.setLineWidth(0.25);
    doc.line(marginX + 10, curY, marginX + 10, bottomLimit);

    // 5. Garis titik-titik horizontal selebar halaman tanpa frame kotak sampai batas kertas halaman
    doc.setDrawColor(theme.dottedLine[0], theme.dottedLine[1], theme.dottedLine[2]);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1.2], 0);
    const lineSpacing = 6.0; // mm jarak antar baris titik-titik
    for (let lineY = curY + 3.5; lineY <= bottomLimit - 1.5; lineY += lineSpacing) {
      doc.line(marginX + 1, lineY, marginX + contentWidth - 1, lineY);
    }
    doc.setLineDashPattern([], 0);

    curY = bottomLimit;
  }

  // Pastikan penanda bawah scan telah digambar jika tidak ada bagian uraian sama sekali
  drawBottomRegistrationMarks();

  // Draw footer on the final page
  drawPageFooter(currentPage);

  // Compile final OMRTemplate object
  const templateId = `TPL-SMEPASDA-${Date.now().toString(36).toUpperCase()}`;
  const template: OMRTemplate = {
    templateId,
    name: `LJK ${exam.namaUjian} ${exam.mataPelajaran} (${exam.tahunPelajaran})`,
    version: 1,
    createdAt: new Date().toISOString(),
    exam,
    paper: {
      size: paperSize,
      widthMm,
      heightMm,
      orientation,
      margins: { top: marginY, bottom: marginY, left: marginX, right: marginX },
      colorMode
    },
    questions,
    bubbleCoordinates,
    registrationMarks,
    studentIdGrid: studentIdGridEnabled
      ? {
          enabled: true,
          digits: studentIdDigits,
          x: marginX + idInfoWidth,
          y: idBoxY,
          bubbleRadius: sidBubbleRadius
        }
      : undefined
  };

  return { doc, template };
}
