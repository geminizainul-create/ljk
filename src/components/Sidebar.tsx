/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Scan,
  CheckSquare,
  KeyRound,
  Users,
  Award,
  BarChart3,
  Settings,
  Layers,
  Sparkles,
  School,
  X
} from 'lucide-react';

export type NavItem =
  | 'dashboard'
  | 'generator'
  | 'templates'
  | 'scanner'
  | 'verification'
  | 'keys'
  | 'participants'
  | 'recap'
  | 'analysis'
  | 'settings';

interface SidebarProps {
  currentTab: NavItem;
  onSelectTab: (tab: NavItem) => void;
  pendingVerificationCount: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingVerificationCount,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'generator', label: 'Generator LJK', icon: FileSpreadsheet },
    { id: 'templates', label: 'Template LJK', icon: Layers },
    { id: 'scanner', label: 'Scan & Koreksi OMR', icon: Scan },
    {
      id: 'verification',
      label: 'Verifikasi Hasil',
      icon: CheckSquare,
      badge: pendingVerificationCount > 0 ? pendingVerificationCount : undefined
    },
    { id: 'keys', label: 'Kunci Jawaban', icon: KeyRound },
    { id: 'participants', label: 'Data Peserta', icon: Users },
    { id: 'recap', label: 'Rekap Nilai', icon: Award },
    { id: 'analysis', label: 'Analisis Butir Soal', icon: BarChart3 },
    { id: 'settings', label: 'Pengaturan Sekolah', icon: Settings },
  ];

  const handleItemClick = (id: NavItem) => {
    onSelectTab(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navContent = (
    <>
      {/* Brand & School Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-blue-500/20 flex-shrink-0">
            <School className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-wide text-white flex items-center gap-1.5">
              LJK SMEPASDA
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono font-medium">OMR</span>
            </h1>
            <p className="text-[11px] text-slate-400 leading-tight">SMP Negeri 2 Pasirian</p>
          </div>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="px-4 py-2 border-b border-slate-800/60">
        <div className="px-2 py-1 rounded bg-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
          <span>NPSN: 20521438</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Siap Koreksi
          </span>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id as NavItem)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full font-bold bg-amber-500 text-slate-950">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">Versi 2.5 (PSAJ 2026)</span>
          <span className="text-[10px] text-sky-400 font-medium">Kab. Lumajang</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-100 flex-col flex-shrink-0 border-r border-slate-800 select-none">
        {navContent}
      </aside>

      {/* Mobile Drawer (Android & Smartphone) */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-100 flex flex-col h-full z-10 shadow-2xl border-r border-slate-800 select-none">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
