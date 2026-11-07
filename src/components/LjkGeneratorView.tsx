/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Save,
  Printer,
  FileJson,
  Upload,
  Check,
  AlertCircle,
  Eye,
  Settings2,
  RefreshCw,
  Sparkles,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import {
  ExamIdentity,
  QuestionConfig,
  PaperSize,
  PaperOrientation,
  PrintColorMode,
  OMRTemplate,
  SchoolSettings
} from '../types/ljk';
import {
  parseQuestionNumbers,
  formatQuestionNumbers,
  checkDuplicateQuestionNumbers
} from '../utils/numberParser';
import { generateLjkPdfAndTemplate } from '../services/pdfGenerator';
import { saveTemplate } from '../services/storage';

interface LjkGeneratorViewProps {
  settings: SchoolSettings;
  onTemplateSaved: (template: OMRTemplate) => void;
  initialExam?: ExamIdentity;
  initialQuestions?: QuestionConfig[];
  templateToEdit?: OMRTemplate | null;
  onClearTemplateToEdit?: () => void;
}

export const LjkGeneratorView: React.FC<LjkGeneratorViewProps> = ({
  settings,
  onTemplateSaved,
  initialExam,
  initialQuestions,
  templateToEdit,
  onClearTemplateToEdit
}) => {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(templateToEdit?.templateId || null);
  const [editingTemplateName, setEditingTemplateName] = useState<string | null>(templateToEdit?.name || null);
  // Exam identity state
  const [exam, setExam] = useState<ExamIdentity>(initialExam || {
    namaSekolah: settings.namaSekolah,
    pemerintah: settings.pemerintah,
    dinas: settings.dinas,
    alamat: settings.alamat,
    kabupaten: settings.kabupaten,
    npsn: settings.npsn,
    namaUjian: 'Penilaian Sumatif Akhir Jenjang (PSAJ)',
    tahunPelajaran: '2025/2026',
    semester: 'Genap',
    jenjang: 'SMP',
    kelas: 'IX',
    mataPelajaran: 'Ilmu Pengetahuan Alam (IPA)',
    hariTanggal: 'Senin, 18 Mei 2026',
    petunjukUmum: 'Gunakan pensil 2B untuk menghitamkan bulatan jawaban secara penuh dan rata.',
    logoUrl: settings.logoUrl
  });

  // Paper options
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<PaperOrientation>('portrait');
  const [colorMode, setColorMode] = useState<PrintColorMode>('bw');
  const [studentIdGridEnabled, setStudentIdGridEnabled] = useState<boolean>(true);
  const [studentIdDigits, setStudentIdDigits] = useState<number>(9);

  // Question sections state
  const [questions, setQuestions] = useState<QuestionConfig[]>(initialQuestions || [
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
  ]);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Handle Logo Upload for Exam Kop Surat
  const handleExamLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setNotification({ type: 'error', message: 'Ukuran file logo maksimal 2 MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setExam(prev => ({ ...prev, logoUrl: base64 }));
      setNotification({ type: 'success', message: 'Logo kop surat berhasil diunggah dan siap dicetak di lembar LJK.' });
    };
    reader.readAsDataURL(file);
  };

  // Load templateToEdit data whenever templateToEdit changes
  useEffect(() => {
    if (templateToEdit) {
      if (templateToEdit.exam) {
        setExam({ ...templateToEdit.exam, logoUrl: templateToEdit.exam.logoUrl !== undefined ? templateToEdit.exam.logoUrl : settings.logoUrl });
      }
      if (templateToEdit.paper) {
        if (templateToEdit.paper.size) setPaperSize(templateToEdit.paper.size);
        if (templateToEdit.paper.orientation) setOrientation(templateToEdit.paper.orientation);
        if (templateToEdit.paper.colorMode) setColorMode(templateToEdit.paper.colorMode);
      }
      if (templateToEdit.studentIdGrid) {
        setStudentIdGridEnabled(!!templateToEdit.studentIdGrid.enabled);
        if (templateToEdit.studentIdGrid.digits) setStudentIdDigits(templateToEdit.studentIdGrid.digits);
      }
      if (Array.isArray(templateToEdit.questions) && templateToEdit.questions.length > 0) {
        const loadedQuestions = templateToEdit.questions.map(q => {
          const rawNumbers = q.rawNumbers || (Array.isArray(q.numbers) ? formatQuestionNumbers(q.numbers) : '');
          const parsed = parseQuestionNumbers(rawNumbers);
          return {
            type: q.type,
            enabled: q.enabled !== undefined ? q.enabled : true,
            rawNumbers,
            numbers: parsed.numbers.length > 0 ? parsed.numbers : (q.numbers || []),
            optionsCount: q.optionsCount || (q.type === 'PG' ? 4 : q.type === 'MENJODOHKAN' ? 5 : 4),
            subItemsCount: q.subItemsCount || (q.type === 'BENAR_SALAH' ? 3 : q.type === 'MENJODOHKAN' ? 4 : undefined),
            pointsPerItem: q.pointsPerItem || (q.type.startsWith('URAIAN') ? 5 : 2)
          };
        });
        setQuestions(loadedQuestions);
      }
      setEditingTemplateId(templateToEdit.templateId);
      setEditingTemplateName(templateToEdit.name);
      setNotification({
        type: 'success',
        message: `Template "${templateToEdit.name}" berhasil dimuat ke editor desain LJK.`
      });
    }
  }, [templateToEdit]);

  // Reset to empty / new template
  const handleResetToNew = () => {
    setEditingTemplateId(null);
    setEditingTemplateName(null);
    setExam({
      namaSekolah: settings.namaSekolah,
      pemerintah: settings.pemerintah,
      dinas: settings.dinas,
      alamat: settings.alamat,
      kabupaten: settings.kabupaten,
      npsn: settings.npsn,
      namaUjian: 'Penilaian Sumatif Akhir Jenjang (PSAJ)',
      tahunPelajaran: '2025/2026',
      semester: 'Genap',
      jenjang: 'SMP',
      kelas: 'IX',
      mataPelajaran: 'Ilmu Pengetahuan Alam (IPA)',
      hariTanggal: 'Senin, 18 Mei 2026',
      petunjukUmum: 'Gunakan pensil 2B untuk menghitamkan bulatan jawaban secara penuh dan rata.',
      logoUrl: settings.logoUrl
    });
    setPaperSize('A4');
    setOrientation('portrait');
    setColorMode('bw');
    setStudentIdGridEnabled(true);
    setStudentIdDigits(9);
    setQuestions([
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
    ]);
    onClearTemplateToEdit?.();
    setNotification({
      type: 'success',
      message: 'Editor telah dialihkan ke mode buat desain LJK baru.'
    });
  };

  // Handle question field edits
  const handleUpdateQuestion = (index: number, updates: Partial<QuestionConfig>) => {
    setQuestions(prev => {
      const copy = [...prev];
      const cur = { ...copy[index], ...updates };

      // Re-parse numbers if rawNumbers changed
      if (updates.rawNumbers !== undefined) {
        const parsed = parseQuestionNumbers(updates.rawNumbers);
        cur.numbers = parsed.numbers;
      }
      copy[index] = cur;
      return copy;
    });
  };

  // Validation checks
  const validation = useMemo(() => {
    // Check duplicates
    const dupCheck = checkDuplicateQuestionNumbers(
      questions.map(q => ({ type: q.type, numbers: q.numbers, enabled: q.enabled }))
    );

    // Total count & points
    let totalQuestions = 0;
    let totalPoints = 0;

    questions.forEach(q => {
      if (q.enabled) {
        totalQuestions += q.numbers.length;
        totalPoints += q.numbers.length * q.pointsPerItem;
      }
    });

    return {
      hasDuplicates: dupCheck.hasDuplicates,
      duplicates: dupCheck.duplicates,
      totalQuestions,
      totalPoints
    };
  }, [questions]);

  // Download Vector PDF
  const handleDownloadPdf = () => {
    if (validation.hasDuplicates) {
      setNotification({
        type: 'error',
        message: `Terdapat nomor soal ganda: ${validation.duplicates.join(', ')}. Harap perbaiki sebelum mencetak.`
      });
      return;
    }

    try {
      const { doc } = generateLjkPdfAndTemplate({
        exam,
        questions,
        paperSize,
        orientation,
        studentIdGridEnabled,
        studentIdDigits,
        colorMode
      });

      const safeName = `LJK_${exam.namaUjian}_${exam.mataPelajaran}_${exam.kelas}`.replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`${safeName}.pdf`);

      setNotification({
        type: 'success',
        message: `File PDF Lembar Jawaban Komputer (${colorMode === 'bw' ? 'Hitam Putih Siap Fotokopi' : 'Warna Standar'}) berhasil diunduh.`
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal menghasilkan PDF' });
    }
  };

  // Save Template to Database
  const handleSaveTemplate = async () => {
    if (validation.hasDuplicates) {
      setNotification({
        type: 'error',
        message: `Terdapat nomor soal ganda: ${validation.duplicates.join(', ')}.`
      });
      return;
    }

    try {
      const { template } = generateLjkPdfAndTemplate({
        exam,
        questions,
        paperSize,
        orientation,
        studentIdGridEnabled,
        studentIdDigits,
        colorMode
      });

      // Jika sedang mengedit template yang sudah ada, pertahankan templateId dan tanggal aslinya
      if (editingTemplateId) {
        template.templateId = editingTemplateId;
        if (templateToEdit?.createdAt) {
          template.createdAt = templateToEdit.createdAt;
        }
      }

      await saveTemplate(template);
      onTemplateSaved(template);
      setEditingTemplateName(template.name);

      setNotification({
        type: 'success',
        message: editingTemplateId
          ? `Perubahan pada template "${template.name}" berhasil diperbarui di sistem!`
          : `Template OMR "${template.name}" berhasil disimpan ke sistem dengan ${template.bubbleCoordinates.length} koordinat bubble.`
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal menyimpan template' });
    }
  };

  // Export Template JSON
  const handleExportTemplateJson = () => {
    const { template } = generateLjkPdfAndTemplate({
      exam,
      questions,
      paperSize,
      orientation,
      studentIdGridEnabled,
      studentIdDigits,
      colorMode
    });

    const jsonStr = JSON.stringify(template, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Template_OMR_${exam.mataPelajaran}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Import Template JSON
  const handleImportTemplateJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        if (!data || typeof data !== 'object' || (!data.questions && !data.exam)) {
          throw new Error('Format file JSON tidak valid. Pastikan file merupakan hasil ekspor Template OMR LJK.');
        }

        // 1. Load exam identity if present
        if (data.exam) {
          setExam(prev => ({
            ...prev,
            ...data.exam
          }));
        }

        // 2. Load paper config if present
        if (data.paper) {
          if (data.paper.size) setPaperSize(data.paper.size);
          if (data.paper.orientation) setOrientation(data.paper.orientation);
          if (data.paper.colorMode) setColorMode(data.paper.colorMode);
        }

        // 3. Load student id grid if present
        if (data.studentIdGrid) {
          setStudentIdGridEnabled(!!data.studentIdGrid.enabled);
          if (data.studentIdGrid.digits) setStudentIdDigits(data.studentIdGrid.digits);
        }

        // 4. Load questions config
        if (Array.isArray(data.questions)) {
          const loadedQuestions = data.questions.map((q: any) => {
            const rawNumbers = q.rawNumbers || (Array.isArray(q.numbers) ? formatQuestionNumbers(q.numbers) : '');
            const parsed = parseQuestionNumbers(rawNumbers);
            return {
              type: q.type,
              enabled: q.enabled !== undefined ? q.enabled : true,
              rawNumbers,
              numbers: parsed.numbers.length > 0 ? parsed.numbers : (q.numbers || []),
              optionsCount: q.optionsCount || (q.type === 'PG' ? 4 : q.type === 'MENJODOHKAN' ? 5 : 4),
              subItemsCount: q.subItemsCount || (q.type === 'BENAR_SALAH' ? 3 : q.type === 'MENJODOHKAN' ? 4 : undefined),
              pointsPerItem: q.pointsPerItem || (q.type.startsWith('URAIAN') ? 5 : 2)
            };
          });
          setQuestions(loadedQuestions);
        }

        // Automatically save imported template to database if it's a complete template object
        if (data.templateId && data.bubbleCoordinates) {
          await saveTemplate(data);
          onTemplateSaved(data);
        }

        setNotification({
          type: 'success',
          message: `Template OMR "${data.name || data.exam?.namaUjian || 'LJK'}" berhasil diimpor! Seluruh konfigurasi soal dan kop ujian telah dimuat ke editor.`
        });
      } catch (err: any) {
        setNotification({
          type: 'error',
          message: `Gagal mengimpor file JSON: ${err.message || 'Format tidak valid'}`
        });
      } finally {
        if (e.target) e.target.value = '';
      }
    };

    reader.onerror = () => {
      setNotification({ type: 'error', message: 'Gagal membaca file JSON dari perangkat' });
    };

    reader.readAsText(file);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Editing Indicator Banner */}
      {editingTemplateId && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse flex-shrink-0"></span>
            <div>
              <p className="font-bold text-blue-900">
                Mode Edit Desain: <span className="underline">{editingTemplateName || 'Template LJK'}</span>
              </p>
              <p className="text-blue-700 mt-0.5">
                Konfigurasi kop, butir soal, dan format kertas dari template ini telah dimuat. Klik "Perbarui Template" untuk menyimpan perubahan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetToNew}
            className="px-3.5 py-1.5 rounded-lg bg-white border border-blue-300 hover:bg-blue-100 text-blue-800 font-bold transition flex items-center gap-1.5 text-xs whitespace-nowrap shadow-2xs self-start sm:self-auto cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>+ Buat Desain Baru</span>
          </button>
        </div>
      )}

      {/* Action Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">
            {editingTemplateId ? `Edit Desain LJK: ${editingTemplateName}` : 'Pengaturan Desain & Layout LJK'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {validation.totalQuestions} butir soal terkonfigurasi • Estimasi skor maksimal: {validation.totalPoints} poin
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportTemplateJson}
            className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
            title="Download file koordinat OMR JSON"
          >
            <FileJson className="w-4 h-4 text-slate-600" />
            <span>Ekspor JSON</span>
          </button>

          <button
            type="button"
            onClick={() => jsonInputRef.current?.click()}
            className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Upload file koordinat OMR JSON untuk memuat template"
          >
            <Upload className="w-4 h-4 text-slate-600" />
            <span>Import JSON</span>
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportTemplateJson}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleSaveTemplate}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4 text-blue-400" />
            <span>{editingTemplateId ? 'Perbarui Template' : 'Simpan Template'}</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Cetak / Download PDF</span>
          </button>
        </div>
      </div>

      {/* Duplicate Error Alert */}
      {validation.hasDuplicates && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-900 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <div>
            <p className="font-bold">Peringatan: Terdapat Nomor Soal Ganda!</p>
            <p className="text-rose-700 mt-0.5">
              Nomor {validation.duplicates.join(', ')} digunakan pada lebih dari satu jenis soal. Pastikan setiap nomor soal unik.
            </p>
          </div>
        </div>
      )}

      {/* Grid: Exam Identity & Paper Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Exam Identity Inputs */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-slate-800 font-bold text-sm">
            <Settings2 className="w-4 h-4 text-blue-600" />
            <span>A. Identitas Ujian & Kop Sekolah</span>
          </div>

          {/* Upload & Preview Logo Kop Surat LJK */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center gap-3.5">
            <div className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-2xs">
              {exam.logoUrl ? (
                <img
                  src={exam.logoUrl}
                  alt="Logo Kop LJK"
                  className="w-full h-full object-contain p-0.5"
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-300" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-xs">Logo Kop Surat LJK</span>
                {exam.logoUrl && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                {exam.logoUrl
                  ? 'Logo ini otomatis dicetak di sisi kiri kop surat lembar LJK.'
                  : settings.logoUrl
                  ? 'Gunakan logo default sekolah atau unggah logo khusus untuk ujian ini.'
                  : 'Unggah logo sekolah/dinas (PNG transparan/JPG, maks 2 MB) untuk dicetak di sisi kiri kop LJK.'}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 transition shadow-2xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{exam.logoUrl ? 'Ganti Logo' : 'Upload Logo Kop'}</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    onChange={handleExamLogoUpload}
                    className="hidden"
                  />
                </label>

                {!exam.logoUrl && settings.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setExam(prev => ({ ...prev, logoUrl: settings.logoUrl }))}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs inline-flex items-center gap-1 transition cursor-pointer"
                  >
                    <span>Gunakan Logo Default Sekolah</span>
                  </button>
                )}

                {exam.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setExam(prev => ({ ...prev, logoUrl: undefined }))}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold text-xs inline-flex items-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Logo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Ujian</label>
              <input
                type="text"
                value={exam.namaUjian}
                onChange={e => setExam({ ...exam, namaUjian: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                placeholder="Penilaian Sumatif Akhir Jenjang (PSAJ)"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
              <input
                type="text"
                value={exam.mataPelajaran}
                onChange={e => setExam({ ...exam, mataPelajaran: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                placeholder="Ilmu Pengetahuan Alam (IPA)"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kelas / Jenjang</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={exam.kelas}
                  onChange={e => setExam({ ...exam, kelas: e.target.value })}
                  className="w-24 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 font-medium"
                  placeholder="IX"
                />
                <input
                  type="text"
                  value={exam.tahunPelajaran}
                  onChange={e => setExam({ ...exam, tahunPelajaran: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 font-medium"
                  placeholder="2025/2026"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hari / Tanggal Ujian</label>
              <input
                type="text"
                value={exam.hariTanggal}
                onChange={e => setExam({ ...exam, hariTanggal: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                placeholder="Senin, 18 Mei 2026"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Sekolah</label>
              <input
                type="text"
                value={exam.namaSekolah}
                onChange={e => setExam({ ...exam, namaSekolah: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pemerintah & Dinas</label>
              <input
                type="text"
                value={exam.pemerintah}
                onChange={e => setExam({ ...exam, pemerintah: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Paper & OMR Registration Setup */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-slate-800 font-bold text-sm">
            <Printer className="w-4 h-4 text-blue-600" />
            <span>B. Kertas & Penanda OMR</span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ukuran Kertas</label>
              <select
                value={paperSize}
                onChange={e => setPaperSize(e.target.value as PaperSize)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 font-medium bg-white"
              >
                <option value="A4">A4 (210 x 297 mm) - Standar</option>
                <option value="F4">F4 / Folio (215 x 330 mm)</option>
                <option value="LEGAL">Legal (215.9 x 355.6 mm)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Orientasi</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                    orientation === 'portrait'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Portrait (Tegak)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                    orientation === 'landscape'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Landscape (Mendatar)
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Warna Cetak / Mode Fotokopi
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setColorMode('bw')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    colorMode === 'bw'
                      ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-500"></span>
                  <span>Hitam Putih (Fotokopi)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode('color')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    colorMode === 'color'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"></span>
                  <span>Warna (Desain Asli)</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                {colorMode === 'bw'
                  ? '✓ Mode Hitam Putih: Latar putih murni tanpa bintik abu-abu (halftone), banner hitam pekat, sangat tajam untuk mesin fotokopi & hemat toner.'
                  : 'Mode Warna: Tampilan dengan gradasi aksen slate/biru untuk printer warna.'}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={studentIdGridEnabled}
                  onChange={e => setStudentIdGridEnabled(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">Grid Bubble Nomor Peserta</span>
              </label>
              <p className="text-[11px] text-slate-500 leading-normal pl-6">
                Menyediakan kotak 0-9 untuk menghitamkan nomor peserta secara otomatis dibaca oleh OMR.
              </p>
              {studentIdGridEnabled && (
                <div className="pl-6 pt-1 flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700">Jumlah Kotak Digit:</label>
                  <select
                    value={studentIdDigits}
                    onChange={e => setStudentIdDigits(parseInt(e.target.value) || 9)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value={9}>9 Kotak (Standar Ujian)</option>
                    <option value={8}>8 Kotak</option>
                    <option value={7}>7 Kotak</option>
                    <option value={6}>6 Kotak</option>
                    <option value={5}>5 Kotak</option>
                    <option value={10}>10 Kotak</option>
                  </select>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                Penanda Sudut (Registration Marks):
              </p>
              <p>4 kotak fiducial solid 7x7 mm di 4 sudut halaman untuk kalibrasi kemiringan dan distorsi perspektif otomatis.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Question Types Configuration Cards */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">C. Konfigurasi Jenis & Nomor Soal</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nomor soal fleksibel dan tidak harus berurutan. Format input: <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">1-25</code> atau <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">1, 6, 7, 13, 17, 23</code>.
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
            Total {validation.totalQuestions} Soal
          </span>
        </div>

        <div className="space-y-4">
          {questions.map((q, idx) => {
            const typeLabels: Record<string, { title: string; desc: string; badge: string }> = {
              PG: {
                title: 'Bagian A. Pilihan Ganda (PG)',
                desc: 'Bulatan pilihan tunggal A, B, C, D (atau E)',
                badge: 'Single Choice'
              },
              PG_KOMPLEKS: {
                title: 'Bagian B. Pilihan Ganda Kompleks',
                desc: 'Peserta dapat memilih lebih dari satu jawaban (A, B, C, D)',
                badge: 'Multi-Select'
              },
              BENAR_SALAH: {
                title: 'Bagian C. Benar - Salah',
                desc: 'Setiap butir memiliki pernyataan dengan bulatan B (Benar) dan S (Salah)',
                badge: 'True/False'
              },
              MENJODOHKAN: {
                title: 'Bagian D. Menjodohkan',
                desc: 'Matriks pasangan item dengan pilihan kolom A, B, C, D, E',
                badge: 'Matching'
              },
              URAIAN_SINGKAT: {
                title: 'Bagian E. Uraian Singkat',
                desc: 'Kotak bergaris 2 kolom efisien untuk jawaban singkat (koreksi manual guru)',
                badge: 'Short Essay'
              },
              URAIAN_PANJANG: {
                title: 'Bagian F. Uraian Panjang',
                desc: 'Lembar bergaris titik-titik penuh satu halaman tanpa frame kotak; siswa bebas menuliskan nomor dan uraian jawaban',
                badge: 'Long Essay'
              }
            };

            const info = typeLabels[q.type];

            return (
              <div
                key={q.type}
                className={`p-4 rounded-xl border transition-all ${
                  q.enabled
                    ? 'border-slate-300 bg-white shadow-2xs'
                    : 'border-slate-200 bg-slate-50/70 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`chk-${q.type}`}
                      checked={q.enabled}
                      onChange={e => handleUpdateQuestion(idx, { enabled: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor={`chk-${q.type}`} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-xs sm:text-sm">{info.title}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-slate-100 text-slate-600">
                          {info.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{info.desc}</p>
                    </label>
                  </div>

                  <div className="text-right flex items-center gap-3 self-end sm:self-auto">
                    <span className="text-xs font-semibold text-slate-600">
                      {q.enabled ? `${q.numbers.length} soal` : 'Nonaktif'}
                    </span>
                  </div>
                </div>

                {q.enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                    <div className="sm:col-span-6">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Daftar Nomor Soal (Rentang / Koma)
                      </label>
                      <input
                        type="text"
                        value={q.rawNumbers}
                        onChange={e => handleUpdateQuestion(idx, { rawNumbers: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-blue-500/20"
                        placeholder="Contoh: 1-25 atau 1, 6, 7, 13"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Parsed: [{q.numbers.slice(0, 8).join(', ')}{q.numbers.length > 8 ? '...' : ''}] ({q.numbers.length} nomor)
                      </p>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block font-semibold text-slate-700 mb-1">Pilihan / Sub-Item</label>
                      {q.type === 'PG' && (
                        <select
                          value={q.optionsCount}
                          onChange={e => handleUpdateQuestion(idx, { optionsCount: parseInt(e.target.value) })}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value={4}>4 Opsi (A, B, C, D) - Standar SMP</option>
                          <option value={5}>5 Opsi (A, B, C, D, E)</option>
                        </select>
                      )}
                      {q.type === 'PG_KOMPLEKS' && (
                        <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-medium">
                          4 Opsi (A, B, C, D)
                        </div>
                      )}
                      {q.type === 'BENAR_SALAH' && (
                        <select
                          value={q.subItemsCount || 3}
                          onChange={e => handleUpdateQuestion(idx, { subItemsCount: parseInt(e.target.value) })}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value={2}>2 Pernyataan (A, B)</option>
                          <option value={3}>3 Pernyataan (A, B, C)</option>
                          <option value={4}>4 Pernyataan (A, B, C, D)</option>
                        </select>
                      )}
                      {q.type === 'MENJODOHKAN' && (
                        <select
                          value={q.subItemsCount || 4}
                          onChange={e => handleUpdateQuestion(idx, { subItemsCount: parseInt(e.target.value) })}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value={3}>3 Pasangan (1-3 dgn A-E)</option>
                          <option value={4}>4 Pasangan (1-4 dgn A-E)</option>
                          <option value={5}>5 Pasangan (1-5 dgn A-E)</option>
                        </select>
                      )}
                      {(q.type === 'URAIAN_SINGKAT' || q.type === 'URAIAN_PANJANG') && (
                        <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-medium">
                          Koreksi Manual Guru
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block font-semibold text-slate-700 mb-1">Bobot Poin / Butir</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={q.pointsPerItem}
                        onChange={e => handleUpdateQuestion(idx, { pointsPerItem: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Subtotal: {q.numbers.length * q.pointsPerItem} poin
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
