/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Layers,
  Download,
  Trash2,
  FileText,
  Calendar,
  CheckCircle2,
  Sparkles,
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import { OMRTemplate, SchoolSettings } from '../types/ljk';
import { generateLjkPdfAndTemplate } from '../services/pdfGenerator';
import { deleteTemplate } from '../services/storage';

interface TemplatesManagerViewProps {
  templates: OMRTemplate[];
  onTemplateDeleted: (templateId: string) => void;
  onSelectTemplateToEdit: (template: OMRTemplate) => void;
}

export const TemplatesManagerView: React.FC<TemplatesManagerViewProps> = ({
  templates,
  onTemplateDeleted,
  onSelectTemplateToEdit
}) => {
  const [notification, setNotification] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ templateId: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const handleDownloadPdf = (template: OMRTemplate) => {
    try {
      const { doc } = generateLjkPdfAndTemplate({
        exam: template.exam,
        questions: template.questions,
        paperSize: template.paper.size,
        orientation: template.paper.orientation,
        studentIdGridEnabled: !!template.studentIdGrid?.enabled,
        studentIdDigits: template.studentIdGrid?.digits || 9,
        colorMode: template.paper.colorMode || 'bw'
      });
      const safeName = `LJK_${template.exam.namaUjian}_${template.exam.mataPelajaran}`.replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`${safeName}.pdf`);
      setNotification(`File PDF untuk "${template.name}" berhasil diunduh.`);
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      alert(`Gagal membuat PDF: ${err.message}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTemplate(deleteTarget.templateId);
      onTemplateDeleted(deleteTarget.templateId);
      setNotification(`Template "${deleteTarget.name}" berhasil dihapus.`);
      setDeleteTarget(null);
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification(`Gagal menghapus template: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      {/* Header bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">Daftar Template LJK Terdaftar</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {templates.length} template dengan koordinat OMR terkalibrasi presisi
          </p>
        </div>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5] mb-2" />
          <h3 className="font-bold text-slate-700 text-sm">Belum Ada Template Tersimpan</h3>
          <p className="text-xs text-slate-500 mt-1">Buat template baru melalui menu "Generator LJK".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map(t => {
            const totalQ = t.questions.reduce((a, b) => a + (b.enabled ? b.numbers.length : 0), 0);
            return (
              <div
                key={t.templateId}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
                      <FileSpreadsheet className="w-5 h-5" />
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600">
                      {t.paper.size} {t.paper.orientation}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-slate-800 mt-3">{t.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.exam.namaSekolah} • Kelas {t.exam.kelas}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Jumlah Soal:</span>
                      <span className="font-bold text-slate-800">{totalQ} Butir</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Koordinat Bubble:</span>
                      <span className="font-mono text-slate-800">{t.bubbleCoordinates.length} titik</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Tanggal Dibuat:</span>
                      <span className="text-slate-500">{new Date(t.createdAt).toLocaleDateString('id-ID')}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ templateId: t.templateId, name: t.name })}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    title="Hapus template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectTemplateToEdit(t)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                    >
                      Edit Desain
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(t)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Cetak PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* In-App Confirmation Modal (bukan native browser confirm) */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-base text-slate-800">Hapus Template LJK?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Apakah Anda yakin ingin menghapus template <span className="font-semibold text-slate-700">"{deleteTarget.name}"</span>? File template dan koordinat OMR ini akan dihapus dari penyimpanan.
              </p>
            </div>

            <div className="pt-2 flex justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Template'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
