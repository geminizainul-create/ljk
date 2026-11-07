/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExamIdentity, QuestionConfig, AnswerKey, OMRTemplate } from '../types/ljk';
import { generateLjkPdfAndTemplate } from './pdfGenerator';

export const DEFAULT_EXAM_IDENTITY: ExamIdentity = {
  namaSekolah: 'SMP Negeri 2 Pasirian',
  pemerintah: 'Pemerintah Kabupaten Lumajang',
  dinas: 'Dinas Pendidikan dan Kebudayaan',
  alamat: 'Jalan Gunung Tambuh No. 01 Pasirian',
  kabupaten: 'Kabupaten Lumajang, Jawa Timur',
  npsn: '20521438',
  namaUjian: 'Penilaian Sumatif Akhir Jenjang (PSAJ)',
  tahunPelajaran: '2025/2026',
  semester: 'Genap',
  jenjang: 'SMP',
  kelas: 'IX',
  mataPelajaran: 'Ilmu Pengetahuan Alam (IPA)',
  hariTanggal: 'Senin, 18 Mei 2026',
  petunjukUmum: 'Gunakan pensil 2B untuk menghitamkan bulatan jawaban secara penuh dan rata.'
};

export const DEFAULT_QUESTION_CONFIGS: QuestionConfig[] = [
  {
    type: 'PG',
    enabled: true,
    rawNumbers: '1-25',
    numbers: Array.from({ length: 25 }, (_, i) => i + 1),
    optionsCount: 4,
    pointsPerItem: 2
  },
  {
    type: 'PG_KOMPLEKS',
    enabled: true,
    rawNumbers: '26-30',
    numbers: [26, 27, 28, 29, 30],
    optionsCount: 4,
    pointsPerItem: 2
  },
  {
    type: 'BENAR_SALAH',
    enabled: true,
    rawNumbers: '31-35',
    numbers: [31, 32, 33, 34, 35],
    optionsCount: 2,
    subItemsCount: 3,
    pointsPerItem: 2
  },
  {
    type: 'MENJODOHKAN',
    enabled: true,
    rawNumbers: '36-40',
    numbers: [36, 37, 38, 39, 40],
    optionsCount: 5,
    subItemsCount: 4,
    pointsPerItem: 2
  },
  {
    type: 'URAIAN_SINGKAT',
    enabled: true,
    rawNumbers: '41-42',
    numbers: [41, 42],
    optionsCount: 0,
    pointsPerItem: 5
  },
  {
    type: 'URAIAN_PANJANG',
    enabled: true,
    rawNumbers: '43-44',
    numbers: [43, 44],
    optionsCount: 0,
    pointsPerItem: 5
  }
];

export function createDefaultTemplate(): OMRTemplate {
  const { template } = generateLjkPdfAndTemplate({
    exam: DEFAULT_EXAM_IDENTITY,
    questions: DEFAULT_QUESTION_CONFIGS,
    paperSize: 'A4',
    orientation: 'portrait',
    studentIdGridEnabled: true,
    studentIdDigits: 9
  });

  template.templateId = 'TPL-SMEPASDA-PSAJ-IX-IPA';
  template.name = 'LJK PSAJ IX IPA 2025/2026 (Standar SMEPASDA)';
  return template;
}

export function createDefaultAnswerKey(templateId: string): AnswerKey {
  // Realistic answer keys for IPA PSAJ
  const pgAnswers = [
    'A', 'C', 'B', 'D', 'A', 'B', 'C', 'D', 'A', 'C',
    'B', 'B', 'A', 'D', 'C', 'A', 'B', 'D', 'C', 'A',
    'B', 'C', 'D', 'A', 'B'
  ];

  const questions: Record<number, any> = {};

  // PG 1-25
  for (let i = 1; i <= 25; i++) {
    questions[i] = {
      questionNumber: i,
      type: 'PG',
      correctAnswer: pgAnswers[i - 1],
      points: 2
    };
  }

  // PG Kompleks 26-30
  const pgkKeys: Record<number, string[]> = {
    26: ['A', 'C'],
    27: ['B', 'D'],
    28: ['A', 'B'],
    29: ['C', 'D'],
    30: ['A', 'D']
  };
  for (let i = 26; i <= 30; i++) {
    questions[i] = {
      questionNumber: i,
      type: 'PG_KOMPLEKS',
      correctAnswer: pgkKeys[i],
      points: 2
    };
  }

  // Benar-Salah 31-35 (Statements 0: A, 1: B, 2: C)
  for (let i = 31; i <= 35; i++) {
    questions[i] = {
      questionNumber: i,
      type: 'BENAR_SALAH',
      correctAnswer: { 0: 'B', 1: 'S', 2: 'B' },
      points: 2
    };
  }

  // Menjodohkan 36-40 (Items 0, 1, 2, 3)
  for (let i = 36; i <= 40; i++) {
    questions[i] = {
      questionNumber: i,
      type: 'MENJODOHKAN',
      correctAnswer: { 0: 'B', 1: 'A', 2: 'D', 3: 'C' },
      points: 2
    };
  }

  // Uraian 41-44
  questions[41] = {
    questionNumber: 41,
    type: 'URAIAN_SINGKAT',
    correctAnswer: 'Metamorfosis Sempurna',
    points: 5,
    rubricNotes: 'Menyebutkan konsep tahapan telur-larva-pupa-imago'
  };
  questions[42] = {
    questionNumber: 42,
    type: 'URAIAN_SINGKAT',
    correctAnswer: 'Hukum Newton III (Aksi - Reaksi)',
    points: 5,
    rubricNotes: 'Menyebutkan rumus F aksi = - F reaksi'
  };
  questions[43] = {
    questionNumber: 43,
    type: 'URAIAN_PANJANG',
    correctAnswer: 'Penjelasan adaptasi morfologi dan fisiologi tumbuhan xerofit',
    points: 5,
    rubricNotes: 'Kriteria: Daun berlapis lilin, stomata tersembunyi, akar panjang (skor 5)'
  };
  questions[44] = {
    questionNumber: 44,
    type: 'URAIAN_PANJANG',
    correctAnswer: 'Penjelasan rangkaian listrik campuran dan perhitungan hambatan pengganti',
    points: 5,
    rubricNotes: 'Langkah perhitungan benar skor 3, rumus benar skor 1, satuan tepat skor 1'
  };

  return {
    keyId: `KEY-${templateId}`,
    templateId,
    examTitle: 'Penilaian Sumatif Akhir Jenjang (PSAJ) 2025/2026',
    subject: 'Ilmu Pengetahuan Alam (IPA)',
    grade: 'IX',
    academicYear: '2025/2026',
    complexScoringMode: 'full_only',
    questions,
    totalMaxScore: 100
  };
}
