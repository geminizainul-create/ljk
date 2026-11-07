/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { Participant, ScanResult, SchoolSettings, AnswerKey } from '../types/ljk';

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
 * Downloads sample Excel file for Answer Key import
 */
export function downloadSampleAnswerKeyExcel() {
  const wb = XLSX.utils.book_new();
  const sampleData = [
    ['Nomor Soal', 'Tipe', 'Kunci Jawaban', 'Poin'],
    [1, 'PG', 'A', 2],
    [2, 'PG', 'C', 2],
    [3, 'PG', 'B', 2],
    [4, 'PG', 'D', 2],
    [5, 'PG', 'A', 2],
    [26, 'PG_KOMPLEKS', 'A, C', 2],
    [27, 'PG_KOMPLEKS', 'B, D', 2],
    [31, 'BENAR_SALAH', 'B, S, B', 2],
    [36, 'MENJODOHKAN', 'B, A, D, C', 2],
    [41, 'URAIAN_SINGKAT', 'Metamorfosis', 5]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);
  ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Kunci Jawaban');
  XLSX.writeFile(wb, 'Format_Kunci_Jawaban_SMEPASDA.xlsx');
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
  const colNumIdx = header.findIndex((h: string) => h.includes('nomor') || h.includes('no'));
  const colTypeIdx = header.findIndex((h: string) => h.includes('tipe') || h.includes('jenis'));
  const colKeyIdx = header.findIndex((h: string) => h.includes('kunci') || h.includes('jawaban'));
  const colPtsIdx = header.findIndex((h: string) => h.includes('poin') || h.includes('bobot') || h.includes('skor'));

  const result: Record<number, { type?: string; answer: any; points?: number }> = {};

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const numStr = String(row[colNumIdx >= 0 ? colNumIdx : 0] || '').trim();
    const qNum = parseInt(numStr, 10);
    if (isNaN(qNum) || qNum <= 0) continue;

    const rawType = colTypeIdx >= 0 ? String(row[colTypeIdx] || '').trim().toUpperCase() : undefined;
    const rawKey = String(row[colKeyIdx >= 0 ? colKeyIdx : 1] || '').trim();
    const rawPts = colPtsIdx >= 0 ? parseFloat(String(row[colPtsIdx])) : undefined;

    let parsedAns: any = rawKey;
    if (rawKey.includes(',') || rawKey.includes(';') || rawKey.includes('|')) {
      const parts = rawKey.split(/[,;|]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
      if (rawType === 'BENAR_SALAH' || rawType === 'MENJODOHKAN') {
        const obj: Record<number, string> = {};
        parts.forEach((p, idx) => { obj[idx] = p; });
        parsedAns = obj;
      } else {
        parsedAns = parts;
      }
    } else if (rawType === 'PG_KOMPLEKS') {
      parsedAns = rawKey ? [rawKey.toUpperCase()] : [];
    } else if (rawType === 'BENAR_SALAH' || rawType === 'MENJODOHKAN') {
      parsedAns = rawKey ? { 0: rawKey.toUpperCase() } : {};
    }

    result[qNum] = {
      type: rawType,
      answer: parsedAns,
      points: !isNaN(rawPts as number) ? rawPts : undefined
    };
  }

  return result;
}

