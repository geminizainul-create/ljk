/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  FileSpreadsheet,
  Scan,
  KeyRound,
  Award,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Layers,
  Sparkles,
  School,
  FileCheck
} from 'lucide-react';
import { NavItem } from './Sidebar';
import { OMRTemplate, ScanResult, Participant, SchoolSettings, AnswerKey } from '../types/ljk';

interface DashboardViewProps {
  templates: OMRTemplate[];
  scans: ScanResult[];
  participants: Participant[];
  answerKeys: AnswerKey[];
  settings: SchoolSettings;
  onNavigate: (tab: NavItem) => void;
  onSelectScanForVerification: (scanId: string) => void;
  onOpenTestSimulation: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  templates,
  scans,
  participants,
  answerKeys,
  settings,
  onNavigate,
  onSelectScanForVerification,
  onOpenTestSimulation
}) => {
  const needsVerificationCount = scans.filter(s => s.needsVerification || s.verificationStatus === 'BELUM_DIVERIFIKASI').length;
  const verifiedCount = scans.filter(s => s.verificationStatus === 'SUDAH_DIVERIFIKASI').length;

  const validGrades = scans.map(s => s.finalGrade);
  const avgGrade = validGrades.length > 0
    ? Math.round((validGrades.reduce((a, b) => a + b, 0) / validGrades.length) * 10) / 10
    : 0;

  const passedCount = scans.filter(s => s.finalGrade >= settings.kktp).length;
  const passRate = scans.length > 0 ? Math.round((passedCount / scans.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Alert Banner if verification is needed */}
      {needsVerificationCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-200/70 flex items-center justify-center text-amber-800">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">
                Terdapat {needsVerificationCount} Lembar Jawaban Memerlukan Verifikasi Manual
              </p>
              <p className="text-xs text-amber-700">
                Deteksi jawaban ganda, isian samar, atau nomor peserta yang belum dipastikan.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('verification')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <span>Buka Ruang Verifikasi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 4 Quick Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('generator')}
          className="p-4 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-left shadow-sm hover:shadow transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-white/10 text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20">A4/F4</span>
          </div>
          <div className="mt-4">
            <h3 className="font-extrabold text-sm tracking-wide">BUAT LJK BARU</h3>
            <p className="text-xs text-blue-100 mt-0.5">Atur soal & cetak PDF vector</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('scanner')}
          className="p-4 bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl text-left shadow-sm hover:shadow transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-white/10 text-white">
              <Scan className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20">OMR 100%</span>
          </div>
          <div className="mt-4">
            <h3 className="font-extrabold text-sm tracking-wide">SCAN & KOREKSI</h3>
            <p className="text-xs text-sky-100 mt-0.5">Upload gambar/PDF atau webcam</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('keys')}
          className="p-4 bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-left shadow-sm hover:shadow transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-white/10 text-white">
              <KeyRound className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20">{answerKeys.length} Kunci</span>
          </div>
          <div className="mt-4">
            <h3 className="font-extrabold text-sm tracking-wide">KELOLA KUNCI JAWABAN</h3>
            <p className="text-xs text-indigo-100 mt-0.5">Atur jawaban benar & bobot</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('recap')}
          className="p-4 bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-left shadow-sm hover:shadow transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-white/10 text-white">
              <Award className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20">Excel</span>
          </div>
          <div className="mt-4">
            <h3 className="font-extrabold text-sm tracking-wide">LIHAT REKAP NILAI</h3>
            <p className="text-xs text-emerald-100 mt-0.5">Statistik kelas & ekspor</p>
          </div>
        </button>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total LJK Dibuat</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{templates.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Template siap cetak</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Peserta</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{participants.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Siswa terdaftar</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Hasil Scan</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{scans.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Lembar diproses OMR</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Telah Diverifikasi</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{verifiedCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Hasil final sah</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Rata-rata Nilai</p>
          <p className="text-2xl font-black text-indigo-600 mt-1">{avgGrade}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Skala 0 - 100</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ketuntasan (KKTP)</p>
          <p className="text-2xl font-black text-teal-600 mt-1">{passRate}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Batas: {settings.kktp}</p>
        </div>
      </div>

      {/* Grid: Recent Scanned Sheets & School Assessment Context */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Scanned Sheets List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Lembar Jawaban Hasil Scan Terkini</h3>
              <p className="text-xs text-slate-500">Daftar lembar yang baru saja dipindai dan dikoreksi</p>
            </div>
            <button
              onClick={() => onNavigate('recap')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>Lihat Semua</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 mt-3 divide-y divide-slate-100 overflow-y-auto max-h-80">
            {scans.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <FileCheck className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5] mb-2" />
                <p className="text-xs font-medium">Belum ada lembar LJK yang dipindai.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Gunakan tombol Uji Coba Cepat atau Scan LJK Baru untuk memulai.</p>
                <button
                  onClick={onOpenTestSimulation}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold hover:bg-sky-100 inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Uji Coba LJK Simulasi</span>
                </button>
              </div>
            ) : (
              scans.slice(0, 6).map((scan) => {
                const student = participants.find(
                  p => p.nomorPeserta === scan.studentNumberDetected || p.id === scan.participantId
                );
                const isPassed = scan.finalGrade >= settings.kktp;
                return (
                  <div
                    key={scan.scanId}
                    className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 px-2 rounded-lg transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {Math.round(scan.finalGrade)}
                      </div>
                      <div>
                        <p className="font-semibold text-xs text-slate-800">
                          {scan.participantName || student?.nama || 'Peserta Mandiri'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          No: {scan.studentNumberDetected || student?.nomorPeserta || '-'} • Kelas: {scan.participantClass || student?.kelas || 'IX'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {scan.needsVerification ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          Perlu Verifikasi
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Sah
                        </span>
                      )}
                      <button
                        onClick={() => onSelectScanForVerification(scan.scanId)}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                      >
                        Periksa
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* School & PSAJ Assessment Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <School className="w-4 h-4 text-blue-600" />
              <span>Profil Evaluasi SMEPASDA</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {settings.namaSekolah} • {settings.kabupaten}
            </p>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Tahun Pelajaran / Jenjang</span>
                <span className="font-bold text-slate-800">2025/2026 • Kelas IX (PSAJ)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Kriteria Ketercapaian (KKTP)</span>
                <span className="font-bold text-emerald-700">{settings.kktp} Poin</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Tipe Soal Didukung</span>
                <span className="font-medium text-slate-700">PG, PG Kompleks, Benar-Salah, Menjodohkan, Uraian</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Keamanan Data & Privasi</span>
                <span className="font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  100% Client-Side OMR (Data tetap di browser)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => onNavigate('settings')}
              className="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
            >
              Ubah Pengaturan Sekolah
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
