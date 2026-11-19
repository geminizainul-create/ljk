/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { Participant, ScanResult, SchoolSettings, AnswerKey, OMRTemplate } from '../types/ljk';

/**
 * Exports grade recapitulation to an Excel (.xlsx) file
 */
export function exportGradesToExcel(
  scans: ScanResult[],
  participants: Participant[],
  examTitle: string,
  subject: string,
  gradeClass: string,
  settings: SchoolSettings
) {
  const wb = XLSX.utils.book_new();

  // Prepare data rows
  const rows: any[] = [];

  // Title rows
  rows.push([settings.namaSekolah.toUpperCase()]);
  rows.push([`REKAPITULASI HASIL ${examTitle.toUpperCase()}`]);
  rows.push([`Mata Pelajaran: ${subject || '-'}`, `Kelas: ${gradeClass || 'Semua'}`, `KKTP: ${settings.kktp}`]);
  rows.push([`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`]);
  rows.push([]); // blank line

  // Header
  rows.push([
    'No',
    'Nomor Peserta',
    'Nama Peserta',
    'Kelas',
    'NIS',
    'Jml Benar',
    'Jml Salah',
    'Jml Kosong',
    'Total Skor',
    'Nilai Akhir',
    'Status Ketuntasan',
    'Status Verifikasi'
  ]);

  // Data rows
  scans.forEach((scan, index) => {
    const student = participants.find(
      p => p.nomorPeserta === scan.studentNumberDetected || p.id === scan.participantId
    );

    let correctCount = 0;
    let wrongCount = 0;
    let emptyCount = 0;

    Object.values(scan.questionResults).forEach(q => {
      if (q.status === 'KOSONG') emptyCount++;
      else if (q.isCorrect) correctCount++;
      else wrongCount++;
    });

    const isPassed = scan.finalGrade >= settings.kktp;

    rows.push([
      index + 1,
      scan.studentNumberDetected || student?.nomorPeserta || '-',
      scan.participantName || student?.nama || 'Peserta Belum Terdaftar',
      scan.participantClass || student?.kelas || '-',
      student?.nis || '-',
      correctCount,
      wrongCount,
      emptyCount,
      scan.totalScore,
      scan.finalGrade,
      isPassed ? 'TUNTAS' : 'BELUM TUNTAS',
      scan.verificationStatus === 'SUDAH_DIVERIFIKASI' ? 'Terverifikasi' : 'Perlu Cek'
    ]);
  });

  // Summary statistics row
  if (scans.length > 0) {
    const grades = scans.map(s => s.finalGrade);
    const avg = Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10;
    const max = Math.max(...grades);
    const min = Math.min(...grades);
    const passed = scans.filter(s => s.finalGrade >= settings.kktp).length;

    rows.push([]);
    rows.push(['STATISTIK PENILAIAN']);
    rows.push(['Jumlah Peserta', scans.length]);
    rows.push(['Rata-rata Nilai', avg]);
    rows.push(['Nilai Tertinggi', max]);
    rows.push(['Nilai Terendah', min]);
    rows.push(['Jumlah Tuntas', `${passed} (${Math.round((passed / scans.length) * 100)}%)`]);
    rows.push(['Jumlah Belum Tuntas', `${scans.length - passed} (${Math.round(((scans.length - passed) / scans.length) * 100)}%)`]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 5 },  // No
    { wch: 16 }, // Nomor Peserta
    { wch: 28 }, // Nama
    { wch: 10 }, // Kelas
    { wch: 10 }, // NIS
    { wch: 10 }, // Benar
    { wch: 10 }, // Salah
    { wch: 10 }, // Kosong
    { wch: 12 }, // Total Skor
    { wch: 12 }, // Nilai
    { wch: 18 }, // Status Ketuntasan
    { wch: 18 }  // Verifikasi
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai');

  // File name
  const safeTitle = (examTitle || 'Rekap_Nilai').replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Rekap_Nilai_${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Exports grade recapitulation to CSV
 */
export function exportGradesToCsv(
  scans: ScanResult[],
  participants: Participant[],
  settings: SchoolSettings
) {
  const headers = ['No,Nomor Peserta,Nama Peserta,Kelas,NIS,Benar,Salah,Kosong,Total Skor,Nilai Akhir,Status Ketuntasan\n'];
  const lines = scans.map((scan, index) => {
    const student = participants.find(
      p => p.nomorPeserta === scan.studentNumberDetected || p.id === scan.participantId
    );
    let c = 0, w = 0, e = 0;
    Object.values(scan.questionResults).forEach(q => {
      if (q.status === 'KOSONG') e++;
      else if (q.isCorrect) c++;
      else w++;
    });
    const isPassed = scan.finalGrade >= settings.kktp;
    return [
      index + 1,
      `"${scan.studentNumberDetected || student?.nomorPeserta || '-'}"`,
      `"${scan.participantName || student?.nama || 'Peserta Belum Terdaftar'}"`,
      `"${scan.participantClass || student?.kelas || '-'}"`,
      `"${student?.nis || '-'}"`,
      c,
      w,
      e,
      scan.totalScore,
      scan.finalGrade,
      `"${isPassed ? 'TUNTAS' : 'BELUM TUNTAS'}"`
    ].join(',');
  });

  const blob = new Blob([headers.concat(lines.join('\n')).join('')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rekap_Nilai_SMEPASDA_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exports Item Analysis (Analisis Butir Soal) to Excel
 */
export function exportItemAnalysisToExcel(
  analysisData: any[],
  examTitle: string,
  settings: SchoolSettings
) {
  const wb = XLSX.utils.book_new();
  const rows: any[] = [];

  rows.push([settings.namaSekolah.toUpperCase()]);
  rows.push([`ANALISIS BUTIR SOAL - ${examTitle.toUpperCase()}`]);
  rows.push([`Tanggal Analisis: ${new Date().toLocaleDateString('id-ID')}`]);
  rows.push([]);

  rows.push([
    'Nomor Soal',
    'Tipe Soal',
    'Kunci Jawaban',
    'Jumlah Benar',
    'Jumlah Salah',
    'Jumlah Kosong',
    '% Ketercapaian',
    'Tingkat Kesukaran',
    'Daya Pembeda',
    'Rekomendasi Tindak Lanjut'
  ]);

  analysisData.forEach(item => {
    rows.push([
      item.questionNumber,
      item.type,
      typeof item.correctAnswer === 'object' ? JSON.stringify(item.correctAnswer) : item.correctAnswer,
      item.correctCount,
      item.wrongCount,
      item.blankCount,
      `${Math.round(item.percentCorrect)}%`,
      item.difficultyText,
      item.discriminationIndex !== undefined ? Math.round(item.discriminationIndex * 100) / 100 : '-',
      item.recommendation
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 35 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Analisis Butir Soal');
  XLSX.writeFile(wb, `Analisis_Butir_Soal_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Downloads a sample Excel file for participant import
 */
export function downloadSampleParticipantExcel() {
  const wb = XLSX.utils.book_new();
  const sampleData = [
    ['Nomor Peserta', 'Nama Lengkap', 'Kelas', 'NIS', 'NISN'],
    ['09-001', 'ACHMAD FADILLAH', 'IX-A', '8401', '0098401123'],
    ['09-002', 'ADINDA PUTRI LESTARI', 'IX-A', '8402', '0098402456'],
    ['09-003', 'BAGAS ARYA PRASETYA', 'IX-A', '8403', '0098403789'],
    ['09-004', 'CHELSEA OLIVIA MAHARANI', 'IX-B', '8404', '0098404012'],
    ['09-005', 'DIMAS SAPUTRA', 'IX-B', '8405', '0098405345']
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);
  ws['!cols'] = [{ wch: 15 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Template Peserta');
  XLSX.writeFile(wb, 'Format_Import_Peserta_SMEPASDA.xlsx');
}

/**
 * Parses an uploaded Excel or CSV file containing participants
 */
export async function parseParticipantsFile(file: File): Promise<Participant[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (rawRows.length < 2) {
    throw new Error('File tidak memiliki data baris peserta');
  }

  // Find header indices
  const header = rawRows[0].map((h: any) => String(h || '').trim().toLowerCase());
  const colNumIdx = header.findIndex((h: string) => h.includes('nomor') || h.includes('no peserta') || h.includes('no'));
  const colNameIdx = header.findIndex((h: string) => h.includes('nama'));
  const colClassIdx = header.findIndex((h: string) => h.includes('kelas'));
  const colNisIdx = header.findIndex((h: string) => h.includes('nis') && !h.includes('nisn'));
  const colNisnIdx = header.findIndex((h: string) => h.includes('nisn'));

  const participants: Participant[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const nomorPeserta = String(row[colNumIdx >= 0 ? colNumIdx : 0] || '').trim();
    const nama = String(row[colNameIdx >= 0 ? colNameIdx : 1] || '').trim();
    const kelas = String(row[colClassIdx >= 0 ? colClassIdx : 2] || 'IX').trim();
    const nis = colNisIdx >= 0 ? String(row[colNisIdx] || '').trim() : undefined;
    const nisn = colNisnIdx >= 0 ? String(row[colNisnIdx] || '').trim() : undefined;

    if (nomorPeserta && nama) {
      participants.push({
        id: `p-${Date.now().toString(36)}-${r}`,
        nomorPeserta,
        nama,
        kelas,
        nis,
        nisn
      });
    }
  }

  return participants;
}

/**
 * Downloads a dynamic Excel template for Answer Key import tailored to the active LJK template
 */
export function downloadAnswerKeyTemplateExcel(template?: OMRTemplate | null, currentKey?: AnswerKey | null) {
  const wb = XLSX.utils.book_new();
  const rows: any[] = [
    ['Nomor Soal', 'Tipe', 'Kunci Jawaban', 'Poin', 'Contoh Pengisian', 'Ketentuan Pengisian']
  ];

  if (template && Array.isArray(template.questions)) {
    const enabledSections = template.questions.filter(q => q.enabled && q.numbers.length > 0);
    const items: { qNum: number; type: string; points: number; optionsCount: number; subItemsCount?: number }[] = [];

    enabledSections.forEach(cfg => {
      cfg.numbers.forEach(qNum => {
        items.push({
          qNum,
          type: cfg.type,
          points: currentKey?.questions?.[qNum]?.type === cfg.type && currentKey?.questions?.[qNum]?.points !== undefined
            ? currentKey.questions[qNum].points
            : (cfg.pointsPerItem ?? 2),
          optionsCount: cfg.optionsCount || (cfg.type === 'MENJODOHKAN' ? 5 : 4),
          subItemsCount: cfg.subItemsCount
        });
      });
    });

    items.sort((a, b) => a.qNum - b.qNum);

    items.forEach(item => {
      const existingQ = currentKey?.questions?.[item.qNum];
      const existingAns = existingQ && existingQ.type === item.type ? existingQ.correctAnswer : undefined;
      const maxOpts = Math.max(1, Math.min(5, item.optionsCount || (item.type === 'MENJODOHKAN' ? 5 : 4)));
      const allowedOpts = ['A', 'B', 'C', 'D', 'E'].slice(0, maxOpts);
      let formattedAns = '';

      if (existingAns !== undefined && existingAns !== null) {
        if (item.type === 'PG') {
          const val = String(existingAns).trim().toUpperCase();
          if (allowedOpts.includes(val)) {
            formattedAns = val;
          }
        } else if (item.type === 'PG_KOMPLEKS') {
          const arr = Array.isArray(existingAns)
            ? existingAns.map(v => String(v).trim().toUpperCase()).filter(v => allowedOpts.includes(v))
            : [];
          if (arr.length > 0) {
            formattedAns = Array.from(new Set(arr)).sort().join(', ');
          }
        } else if (item.type === 'BENAR_SALAH') {
          const cnt = item.subItemsCount || 3;
          if (typeof existingAns === 'object' && existingAns !== null) {
            const vals: string[] = [];
            let allValid = true;
            for (let i = 0; i < cnt; i++) {
              const v = String((existingAns as Record<number, string>)[i] ?? '').trim().toUpperCase();
              if (v !== 'B' && v !== 'S') {
                allValid = false;
                break;
              }
              vals.push(v);
            }
            if (allValid && vals.length === cnt) {
              formattedAns = vals.join(', ');
            }
          }
        } else if (item.type === 'MENJODOHKAN') {
          const cnt = item.subItemsCount || 4;
          if (typeof existingAns === 'object' && existingAns !== null) {
            const vals: string[] = [];
            let allValid = true;
            for (let i = 0; i < cnt; i++) {
              const v = String((existingAns as Record<number, string>)[i] ?? '').trim().toUpperCase();
              if (!allowedOpts.includes(v)) {
                allValid = false;
                break;
              }
              vals.push(v);
            }
            if (allValid && vals.length === cnt) {
              formattedAns = vals.join(', ');
            }
          }
        } else if (typeof existingAns === 'string') {
          formattedAns = existingAns.trim();
        }
      }

      let example = '';
      let guide = '';
      if (item.type === 'PG') {
        example = allowedOpts[0] || 'A';
        guide = `Isi tepat 1 huruf (${allowedOpts.join('/')})`;
      } else if (item.type === 'PG_KOMPLEKS') {
        example = allowedOpts.length >= 3 ? `${allowedOpts[0]}, ${allowedOpts[2]}` : allowedOpts.slice(0, 2).join(', ');
        guide = `Pilih >1 huruf (${allowedOpts.join('/')}), pisahkan dengan koma`;
      } else if (item.type === 'BENAR_SALAH') {
        const cnt = item.subItemsCount || 3;
        example = Array.from({ length: cnt }, (_, i) => (i % 2 === 0 ? 'B' : 'S')).join(', ');
        guide = `Isi tepat ${cnt} huruf B/S berurutan untuk Pernyataan 1–${cnt}, pisah koma`;
      } else if (item.type === 'MENJODOHKAN') {
        const cnt = item.subItemsCount || 4;
        example = Array.from({ length: cnt }, (_, i) => allowedOpts[i % allowedOpts.length]).join(', ');
        guide = `Isi tepat ${cnt} huruf pasangan (${allowedOpts[0]}-${allowedOpts[allowedOpts.length - 1]}) berurutan, pisah koma`;
      } else if (item.type === 'URAIAN_PANJANG') {
        example = 'Menjelaskan langkah penyelesaian secara runtut';
        guide = 'Tulis ringkasan rubrik penilaian uraian';
      } else {
        example = 'Metamorfosis Sempurna';
        guide = 'Tulis kata/frasa singkat pedoman penilaian';
      }

      rows.push([item.qNum, item.type, formattedAns, item.points, example, guide]);
    });
  } else {
    rows.push(
      [1, 'PG', '', 2, 'A', 'Isi tepat 1 huruf (A/B/C/D/E)'],
      [2, 'PG', '', 2, 'C', 'Isi tepat 1 huruf (A/B/C/D/E)'],
      [3, 'PG', '', 2, 'B', 'Isi tepat 1 huruf (A/B/C/D/E)'],
      [26, 'PG_KOMPLEKS', '', 2, 'A, C', 'Pilih >1 huruf (A/B/C/D), pisahkan dengan koma'],
      [31, 'BENAR_SALAH', '', 2, 'B, S, B', 'Isi tepat 3 huruf B/S berurutan untuk Pernyataan 1–3, pisah koma'],
      [36, 'MENJODOHKAN', '', 2, 'B, A, D, C', 'Isi tepat 4 huruf pasangan (A-E) berurutan, pisah koma'],
      [41, 'URAIAN_SINGKAT', '', 5, 'Metamorfosis', 'Tulis kata/frasa singkat pedoman penilaian']
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 13 },
    { wch: 18 },
    { wch: 24 },
    { wch: 10 },
    { wch: 24 },
    { wch: 52 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Kunci Jawaban');

  // Add second sheet with clear instructions
  const guideRows = [
    ['PANDUAN PENGISIAN TEMPLATE KUNCI JAWABAN EXCEL'],
    [],
    ['Tipe Soal', 'Ketentuan Penulisan pada Kolom Kunci Jawaban', 'Contoh Benar'],
    ['PG', 'Satu huruf kapital sesuai opsi pada LJK (A, B, C, D, atau E)', 'A'],
    ['PG_KOMPLEKS', 'Beberapa huruf kapital dipisahkan koma', 'A, C'],
    ['BENAR_SALAH', 'Urutan huruf B (Benar) atau S (Salah) dipisahkan koma sesuai jumlah pernyataan pada LJK', 'B, S, B'],
    ['MENJODOHKAN', 'Urutan huruf pasangan (A-E) dipisahkan koma sesuai jumlah item pada LJK', 'B, A, D, C'],
    ['URAIAN_SINGKAT', 'Teks kata kunci / pedoman jawaban singkat', 'Fotosintesis'],
    ['URAIAN_PANJANG', 'Teks rubrik penilaian uraian panjang', 'Menjelaskan 3 tahap secara runtut'],
    [],
    ['Catatan Penting:'],
    ['1. Jangan mengubah kolom Nomor Soal dan Tipe agar tetap sinkron dengan desain LJK.'],
    ['2. Isi atau perbarui kolom Kunci Jawaban sesuai kolom Contoh Pengisian & Ketentuan Pengisian, lalu simpan (.xlsx) dan klik "Import Excel".'],
    ['3. Baris yang kolom Kunci Jawaban-nya dibiarkan kosong tidak akan menimpa kunci yang sudah ada.']
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 20 }, { wch: 68 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Pengisian');

  const safeSubject = (currentKey?.subject || template?.exam?.mataPelajaran || 'SMEPASDA').replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Template_Kunci_Jawaban_${safeSubject}.xlsx`);
}

/**
 * Downloads sample Excel file for Answer Key import (backward-compatible helper)
 */
export function downloadSampleAnswerKeyExcel() {
  downloadAnswerKeyTemplateExcel();
}

/**
 * Parses uploaded Excel file for Answer Key
 */
export async function parseAnswerKeyExcel(file: File): Promise<Record<number, { type?: string; answer: any; points?: number }>> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (rawRows.length < 2) {
    throw new Error('File tidak memiliki data baris kunci jawaban');
  }

  const header = rawRows[0].map((h: any) => String(h || '').trim().toLowerCase());
  const colNumIdx = header.findIndex((h: string) => h.includes('nomor') || h === 'no');
  const colTypeIdx = header.findIndex((h: string) => h.includes('tipe') || h.includes('jenis'));
  const colKeyIdx = header.findIndex((h: string) => h.includes('kunci') || h.includes('jawaban'));
  const colPtsIdx = header.findIndex((h: string) => h.includes('poin') || h.includes('bobot') || h.includes('skor'));

  const result: Record<number, { type?: string; answer: any; points?: number }> = {};

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const numStr = String(row[colNumIdx >= 0 ? colNumIdx : 0] ?? '').trim();
    const qNum = parseInt(numStr, 10);
    if (isNaN(qNum) || qNum <= 0) continue;

    const rawType = colTypeIdx >= 0
      ? String(row[colTypeIdx] ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
      : undefined;
    const keyColIndex = colKeyIdx >= 0 ? colKeyIdx : (colTypeIdx >= 0 ? 2 : 1);
    const rawKey = String(row[keyColIndex] ?? '').trim();
    const rawPts = colPtsIdx >= 0 ? parseFloat(String(row[colPtsIdx] ?? '')) : undefined;

    // Skip empty answer rows so blank cells don't wipe existing keys
    if (!rawKey || rawKey === '-') continue;

    let parsedAns: any = rawKey;
    const isEssay = rawType === 'URAIAN_SINGKAT' || rawType === 'URAIAN_PANJANG';

    if (!isEssay) {
      if (rawKey.includes(',') || rawKey.includes(';') || rawKey.includes('|') || /\s+/.test(rawKey)) {
        const parts = rawKey
          .split(/[,;|\s]+/)
          .map(s => {
            const up = s.trim().toUpperCase();
            if (rawType === 'BENAR_SALAH') {
              if (up === 'BENAR') return 'B';
              if (up === 'SALAH') return 'S';
            }
            return up;
          })
          .filter(Boolean);

        if (rawType === 'BENAR_SALAH' || rawType === 'MENJODOHKAN') {
          const obj: Record<number, string> = {};
          parts.forEach((p, idx) => { obj[idx] = p; });
          parsedAns = obj;
        } else {
          parsedAns = parts;
        }
      } else if (rawType === 'PG_KOMPLEKS') {
        const up = rawKey.toUpperCase();
        parsedAns = up.length > 1 && /^[A-E]+$/.test(up) ? up.split('') : [up];
      } else if (rawType === 'BENAR_SALAH') {
        const up = rawKey.toUpperCase();
        if (up === 'BENAR') {
          parsedAns = { 0: 'B' };
        } else if (up === 'SALAH') {
          parsedAns = { 0: 'S' };
        } else if (up.length > 1 && /^[BS]+$/.test(up)) {
          const obj: Record<number, string> = {};
          up.split('').forEach((ch, idx) => { obj[idx] = ch; });
          parsedAns = obj;
        } else {
          parsedAns = { 0: up };
        }
      } else if (rawType === 'MENJODOHKAN') {
        const up = rawKey.toUpperCase();
        if (up.length > 1 && /^[A-E]+$/.test(up)) {
          const obj: Record<number, string> = {};
          up.split('').forEach((ch, idx) => { obj[idx] = ch; });
          parsedAns = obj;
        } else {
          parsedAns = { 0: up };
        }
      } else {
        parsedAns = rawKey.toUpperCase();
      }
    }

    result[qNum] = {
      type: rawType || undefined,
      answer: parsedAns,
      points: rawPts !== undefined && !isNaN(rawPts) ? rawPts : undefined
    };
  }

  return result;
}

