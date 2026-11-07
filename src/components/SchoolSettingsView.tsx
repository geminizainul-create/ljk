/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  School,
  Save,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  Image as ImageIcon
} from 'lucide-react';
import { SchoolSettings } from '../types/ljk';
import {
  saveSchoolSettings,
  exportDatabaseBackup,
  importDatabaseBackup,
  clearAllScanResults
} from '../services/storage';

interface SchoolSettingsViewProps {
  settings: SchoolSettings;
  onSettingsUpdated: (newSettings: SchoolSettings) => void;
  onDataReset: () => void;
}

export const SchoolSettingsView: React.FC<SchoolSettingsViewProps> = ({
  settings,
  onSettingsUpdated,
  onDataReset
}) => {
  const [formData, setFormData] = useState<SchoolSettings>({ ...settings });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showClearModal, setShowClearModal] = useState<boolean>(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setNotification({ type: 'error', message: 'Ukuran file logo maksimal 2 MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData(prev => ({ ...prev, logoUrl: base64 }));
      setNotification({ type: 'success', message: 'Logo berhasil dipilih. Klik "Simpan Pengaturan" untuk menyimpan.' });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSchoolSettings(formData);
      onSettingsUpdated(formData);
      setNotification({ type: 'success', message: 'Pengaturan sekolah dan parameter penilaian berhasil disimpan.' });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal menyimpan pengaturan' });
    }
  };

  const handleExportBackup = async () => {
    try {
      const jsonStr = await exportDatabaseBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Backup_LJK_SMEPASDA_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotification({ type: 'success', message: 'File backup data aplikasi berhasil diunduh.' });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal membuat file backup' });
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await importDatabaseBackup(text);
      if (res.success) {
        setNotification({ type: 'success', message: res.message });
        onDataReset();
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Gagal membaca file backup JSON' });
    }
  };

  const handleConfirmClearScans = async () => {
    await clearAllScanResults();
    onDataReset();
    setShowClearModal(false);
    setNotification({ type: 'success', message: 'Semua hasil scan dan nilai siswa berhasil dikosongkan.' });
    setTimeout(() => setNotification(null), 3500);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <School className="w-5 h-5 text-blue-600" />
              <span>Profil Sekolah & Pengaturan Aplikasi</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Data ini akan dicantumkan pada kop surat LJK resmi dan laporan penilaian
            </p>
          </div>

          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Pengaturan</span>
          </button>
        </div>

        {/* School Identity */}
        <div className="space-y-4 text-xs">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-500">
            Identitas Resmi Sekolah
          </h3>

          {/* Logo Sekolah */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-2xs">
              {formData.logoUrl ? (
                <img
                  src={formData.logoUrl}
                  alt="Logo Sekolah"
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <ImageIcon className="w-7 h-7 text-slate-300" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <label className="block font-bold text-slate-800 text-xs">
                Logo Resmi Kop Surat Sekolah
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Format: PNG transparan atau JPG (disarankan 1:1 persegi, maks 2 MB). Logo ini otomatis dicetak di sisi kiri kop surat LJK.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <label className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 transition shadow-2xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{formData.logoUrl ? 'Ganti Logo' : 'Upload Logo Kop'}</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
                {formData.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, logoUrl: undefined }))}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold text-xs transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Logo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Satuan Pendidikan</label>
              <input
                type="text"
                value={formData.namaSekolah}
                onChange={e => setFormData({ ...formData, namaSekolah: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nomor Pokok Sekolah Nasional (NPSN)</label>
              <input
                type="text"
                value={formData.npsn}
                onChange={e => setFormData({ ...formData, npsn: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pemerintah Daerah</label>
              <input
                type="text"
                value={formData.pemerintah}
                onChange={e => setFormData({ ...formData, pemerintah: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Dinas Terkait</label>
              <input
                type="text"
                value={formData.dinas}
                onChange={e => setFormData({ ...formData, dinas: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap Sekolah</label>
              <input
                type="text"
                value={formData.alamat}
                onChange={e => setFormData({ ...formData, alamat: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kabupaten / Kota</label>
              <input
                type="text"
                value={formData.kabupaten}
                onChange={e => setFormData({ ...formData, kabupaten: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Provinsi</label>
              <input
                type="text"
                value={formData.provinsi}
                onChange={e => setFormData({ ...formData, provinsi: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>

        {/* Parameters */}
        <div className="pt-4 border-t border-slate-100 space-y-4 text-xs">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-500">
            Parameter Penilaian & Sensitivitas OMR
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.kktp}
                onChange={e => setFormData({ ...formData, kktp: parseInt(e.target.value) || 75 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold font-mono focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="text-[11px] text-slate-500 mt-1">Batas nilai minimal untuk status "TUNTAS".</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ambang Standar Keterisian Bubble OMR
              </label>
              <input
                type="number"
                min="0.1"
                max="0.9"
                step="0.05"
                value={formData.omrThreshold}
                onChange={e => setFormData({ ...formData, omrThreshold: parseFloat(e.target.value) || 0.40 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold font-mono focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Rasio kehitaman pixel minimal (0.40 = 40% area dalam lingkaran terisi pensil).
              </p>
            </div>
          </div>
        </div>
      </form>

      {/* Backup, Restore & Data Storage Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 text-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-slate-800 font-bold text-sm">
          <HardDrive className="w-5 h-5 text-indigo-600" />
          <span>Penyimpanan Lokal & Keamanan Data (IndexedDB)</span>
        </div>

        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-bold">Privasi Penuh:</span> Seluruh gambar scan, data nilai siswa, dan kunci jawaban tersimpan secara aman di dalam peramban web perangkat Anda (Local IndexedDB). Tidak ada data lembar ujian atau identitas siswa yang diunggah ke cloud luar.
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportBackup}
            className="px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Unduh Cadangan Lengkap (Backup JSON)</span>
          </button>

          <label className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 cursor-pointer transition">
            <Upload className="w-4 h-4 text-slate-600" />
            <span>Pulihkan Data (Restore JSON)</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowClearModal(true)}
            className="px-4 py-2 rounded-lg text-rose-700 hover:bg-rose-50 border border-rose-200 font-semibold flex items-center gap-1.5 transition ml-auto"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Kosongkan Hasil Scan</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Clearing Scans */}
      {showClearModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-base text-slate-800">Kosongkan Semua Hasil Scan?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                PERINGATAN: Apakah Anda yakin ingin menghapus seluruh hasil scan lembar jawaban dan nilai siswa dari penyimpanan lokal? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="pt-2 flex justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmClearScans}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Kosongkan Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
