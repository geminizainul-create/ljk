/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { NavItem } from './Sidebar';
import { SchoolSettings } from '../types/ljk';
import { Sparkles, HelpCircle, HardDrive, Calendar, Menu } from 'lucide-react';

interface HeaderProps {
  currentTab: NavItem;
  settings: SchoolSettings;
  onOpenTestSimulation: () => void;
  onOpenQuickScan: () => void;
  onToggleMobileMenu?: () => void;
}

const TAB_TITLES: Record<NavItem, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard Evaluasi',
    subtitle: 'Sistem Terpadu LJK, Scanner OMR, dan Koreksi Otomatis SMP Negeri 2 Pasirian'
  },
  generator: {
    title: 'Generator LJK',
    subtitle: 'Buat LJK kustom sesuai jenis dan nomor soal dengan koordinat OMR terstandarisasi'
  },
  templates: {
    title: 'Manajemen Template LJK',
    subtitle: 'Daftar template LJK dan koordinat bubble terdaftar'
  },
  scanner: {
    title: 'Pemindai & Koreksi OMR',
    subtitle: 'Proses scan LJK, deteksi penanda sudut, koreksi perspektif, dan baca jawaban siswa'
  },
  verification: {
    title: 'Verifikasi Hasil Jawaban',
    subtitle: 'Periksa hasil pembacaan bubble berdampingan dengan gambar scan asli'
  },
  keys: {
    title: 'Manajemen Kunci Jawaban',
    subtitle: 'Atur kunci jawaban PG, PG Kompleks, Benar-Salah, Menjodohkan, dan rubrik uraian'
  },
  participants: {
    title: 'Data Peserta Ujian',
    subtitle: 'Kelola data siswa, nomor peserta, kelas, serta import dari Excel/CSV'
  },
  recap: {
    title: 'Rekapitulasi Nilai & Kelulusan',
    subtitle: 'Laporan nilai lengkap dengan batas KKTP dan ekspor ke Excel'
  },
  analysis: {
    title: 'Analisis Butir Soal',
    subtitle: 'Distribusi jawaban, tingkat kesukaran, daya pembeda, dan saran tindak lanjut guru'
  },
  settings: {
    title: 'Pengaturan Sekolah',
    subtitle: 'Identitas instansi, batas KKTP, sensitivitas OMR, dan backup data lokal'
  }
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  settings,
  onOpenTestSimulation,
  onOpenQuickScan,
  onToggleMobileMenu
}) => {
  const currentInfo = TAB_TITLES[currentTab] || { title: 'LJK SMEPASDA', subtitle: '' };

  return (
    <header className="bg-white border-b border-slate-200 px-3.5 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between shadow-xs select-none">
      <div className="flex items-center gap-2 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            aria-label="Buka Menu Navigasi"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-800 tracking-tight truncate">
            {currentInfo.title}
          </h2>
          <p className="text-[11px] text-slate-500 hidden sm:block truncate">{currentInfo.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Quick simulation runner button (hidden on very small mobile) */}
        <button
          onClick={onOpenTestSimulation}
          className="hidden sm:flex px-2.5 sm:px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 text-xs font-semibold items-center gap-1.5 transition-colors shadow-2xs"
          title="Uji coba algoritma OMR dengan lembar scan sintetis siap pakai"
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-600" />
          <span className="hidden md:inline">Uji Coba Cepat (Test Mode)</span>
          <span className="md:hidden">Simulasi</span>
        </button>

        {/* Quick scan button */}
        <button
          onClick={onOpenQuickScan}
          className="px-3 sm:px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <span>+ Scan LJK</span>
        </button>

        {/* School Badge */}
        <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-slate-200 text-xs text-slate-600">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="font-medium text-slate-700 truncate max-w-[150px]">{settings.namaSekolah}</span>
        </div>
      </div>
    </header>
  );
};
