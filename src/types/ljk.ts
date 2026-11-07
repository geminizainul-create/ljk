/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type QuestionType =
  | 'PG'
  | 'PG_KOMPLEKS'
  | 'BENAR_SALAH'
  | 'MENJODOHKAN'
  | 'URAIAN_SINGKAT'
  | 'URAIAN_PANJANG';

export type PaperSize = 'A4' | 'F4' | 'LEGAL';
export type PaperOrientation = 'portrait' | 'landscape';
export type PrintColorMode = 'bw' | 'color';

export interface ExamIdentity {
  namaSekolah: string;
  pemerintah: string;
  dinas: string;
  alamat: string;
  kabupaten: string;
  npsn: string;
  namaUjian: string;
  tahunPelajaran: string;
  semester: string;
  jenjang: string;
  kelas: string;
  mataPelajaran: string;
  hariTanggal: string;
  petunjukUmum: string;
  logoUrl?: string; // Base64 data URL logo kop surat sekolah
}

export interface QuestionConfig {
  type: QuestionType;
  enabled: boolean;
  rawNumbers: string; // e.g. "1-25" or "1, 6, 7, 13"
  numbers: number[];  // parsed array of integers
  optionsCount: number; // e.g. 4 for A-D, 5 for A-E
  subItemsCount?: number; // for Benar-Salah (statements A-C/D) or Menjodohkan (pairs 1-4)
  pointsPerItem: number;
}

export interface BubbleCoordinate {
  id: string;
  questionNumber: number;
  type: QuestionType;
  option: string; // 'A', 'B', 'C', 'D', 'BENAR', 'SALAH', etc.
  subItemIndex?: number; // 0, 1, 2 for statements/pairs
  page: number;
  x: number; // mm
  y: number; // mm
  radius: number; // mm
}

export interface RegistrationMark {
  corner: 'TL' | 'TR' | 'BL' | 'BR';
  x: number; // mm
  y: number; // mm
  size: number; // mm (e.g. 7mm square)
}

export interface StudentIdGridConfig {
  enabled: boolean;
  digits: number; // default 9 (e.g. 9 kotak digit nomor peserta)
  x: number;
  y: number;
  bubbleRadius: number;
}

export interface OMRTemplate {
  templateId: string;
  name: string;
  version: number;
  createdAt: string;
  exam: ExamIdentity;
  paper: {
    size: PaperSize;
    widthMm: number;
    heightMm: number;
    orientation: PaperOrientation;
    margins: { top: number; bottom: number; left: number; right: number };
    colorMode?: PrintColorMode;
  };
  questions: QuestionConfig[];
  bubbleCoordinates: BubbleCoordinate[];
  registrationMarks: RegistrationMark[];
  studentIdGrid?: StudentIdGridConfig;
}

export type ComplexScoringMode = 'full_only' | 'partial' | 'penalty';

export interface SingleQuestionKey {
  questionNumber: number;
  type: QuestionType;
  // PG: 'A' | 'B' | 'C' | 'D'
  // PG_KOMPLEKS: ['A', 'C']
  // BENAR_SALAH: { 0: 'BENAR', 1: 'SALAH', 2: 'BENAR' }
  // MENJODOHKAN: { 0: 'B', 1: 'A', 2: 'D' }
  // URAIAN: rubric description
  correctAnswer: any;
  points: number;
  rubricNotes?: string;
}

export interface AnswerKey {
  keyId: string;
  templateId: string;
  examTitle: string;
  subject: string;
  grade: string;
  academicYear: string;
  complexScoringMode: ComplexScoringMode;
  questions: Record<number, SingleQuestionKey>;
  totalMaxScore: number;
}

export interface Participant {
  id: string;
  nomorPeserta: string;
  nama: string;
  kelas: string;
  nis?: string;
  nisn?: string;
}

export type DetectedAnswerStatus =
  | 'TERISI'
  | 'KOSONG'
  | 'GANDA'
  | 'TIDAK_TERBACA'
  | 'PERLU_VERIFIKASI';

export interface QuestionDetectionResult {
  questionNumber: number;
  type: QuestionType;
  detectedAnswer: any; // 'A', ['A', 'C'], etc.
  status: DetectedAnswerStatus;
  fillRatios: Record<string, number>; // option -> 0.0 to 1.0
  isCorrect?: boolean;
  scoreEarned: number;
  maxScore: number;
  verifiedManually?: boolean;
  notes?: string;
}

export interface ScanResult {
  scanId: string;
  templateId: string;
  keyId?: string;
  timestamp: string;
  fileName: string;
  studentNumberDetected?: string;
  participantId?: string;
  participantName?: string;
  participantClass?: string;
  totalScore: number;
  maxScore: number;
  finalGrade: number; // 0 - 100
  isPassed: boolean;
  needsVerification: boolean;
  verificationStatus: 'BELUM_DIVERIFIKASI' | 'SUDAH_DIVERIFIKASI';
  questionResults: Record<number, QuestionDetectionResult>;
  essayScores?: Record<number, number>;
  isPendingEssay: boolean;
  sheetImageDataUrl: string; // Base64 normalized warped image of the sheet
  calibrationConfidence: number; // 0 - 100
  detectedCorners?: { x: number; y: number }[];
}

export interface SchoolSettings {
  namaSekolah: string;
  pemerintah: string;
  dinas: string;
  alamat: string;
  kabupaten: string;
  provinsi: string;
  npsn: string;
  kktp: number; // default 75
  omrThreshold: number; // default 0.40
  logoUrl?: string; // Base64 data URL logo sekolah resmi
}
