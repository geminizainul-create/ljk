/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Award,
  Download,
  FileSpreadsheet,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  TrendingUp,
  UserCheck,
  ChevronRight,
  SlidersHorizontal
} from 'lucide-react';
import { ScanResult, Participant, SchoolSettings, OMRTemplate } from '../types/ljk';
import { exportGradesToExcel, exportGradesToCsv } from '../services/excelService';

interface GradeRecapViewProps {
  scans: ScanResult[];
  participants: Participant[];
  settings: SchoolSettings;
  templates: OMRTemplate[];
  onNavigateToVerification: (scanId: string) => void;
}

export const GradeRecapView: React.FC<GradeRecapViewProps> = ({
  scans,
  participants,
  settings,
  templates,
  onNavigateToVerification
}) => {
  const [search, setSearch] = useState<string>('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'grade_desc' | 'grade_asc' | 'name_asc'>('grade_desc');
  const [kktpValue, setKktpValue] = useState<number>(settings.kktp || 75);

  // Available classes
  const classes = useMemo(() => {
    const set = new Set<string>();
    scans.forEach(s => {
      const cls = s.participantClass || participants.find(p => p.nomorPeserta === s.studentNumberDetected)?.kelas;
      if (cls) set.add(cls);
    });
    return ['all', ...Array.from(set).sort()];
  }, [scans, participants]);

  // Prepared row items
  const processedItems = useMemo(() => {
    return scans.map(scan => {
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

      const studentName = scan.participantName || student?.nama || 'Peserta Belum Terdaftar';
      const studentClass = scan.participantClass || student?.kelas || 'IX';
      const studentNum = scan.studentNumberDetected || student?.nomorPeserta || '-';
      const isPassed = scan.finalGrade >= kktpValue;

      return {
        scan,
        studentNum,
        studentName,
        studentClass,
        nis: student?.nis || '-',
        correctCount,
        wrongCount,
        emptyCount,
        finalGrade: scan.finalGrade,
        totalScore: scan.totalScore,
        maxScore: scan.maxScore,
        isPassed
      };
    });
  }, [scans, participants, kktpValue]);

  // Filtered and Sorted
  const filtered = useMemo(() => {
    return processedItems
      .filter(item => {
        const matchClass = filterClass === 'all' || item.studentClass === filterClass;
        const q = search.toLowerCase();
        const matchSearch =
          item.studentName.toLowerCase().includes(q) ||
          item.studentNum.toLowerCase().includes(q);
        return matchClass && matchSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'grade_desc') return b.finalGrade - a.finalGrade;
        if (sortBy === 'grade_asc') return a.finalGrade - b.finalGrade;
        return a.studentName.localeCompare(b.studentName);
      });
  }, [processedItems, filterClass, search, sortBy]);

  // Statistics
  const stats = useMemo(() => {
    if (filtered.length === 0) {
      return { highest: 0, lowest: 0, average: 0, median: 0, passed: 0, failed: 0, passRate: 0 };
    }

    const grades = filtered.map(f => f.finalGrade).sort((a, b) => a - b);
    const highest = Math.max(...grades);
    const lowest = Math.min(...grades);
    const average = Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10;

    const mid = Math.floor(grades.length / 2);
    const median = grades.length % 2 !== 0 ? grades[mid] : (grades[mid - 1] + grades[mid]) / 2;

    const passed = filtered.filter(f => f.isPassed).length;
    const failed = filtered.length - passed;
    const passRate = Math.round((passed / filtered.length) * 100);

    return { highest, lowest, average, median, passed, failed, passRate };
  }, [filtered]);

  // Export handlers
  const handleExportExcel = () => {
    exportGradesToExcel(
      filtered.map(f => f.scan),
      participants,
      'Penilaian Sumatif Akhir Jenjang (PSAJ)',
      'IPA',
      filterClass === 'all' ? 'Semua Kelas' : filterClass,
      { ...settings, kktp: kktpValue }
    );
  };

  const handleExportCsv = () => {
    exportGradesToCsv(filtered.map(f => f.scan), participants, { ...settings, kktp: kktpValue });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">Rekapitulasi Nilai Ujian</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Laporan lengkap hasil koreksi komputer dengan batas KKTP: {kktpValue} poin
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Cetak Rekap</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Ekspor CSV</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Ekspor ke Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Statistical Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jumlah Peserta</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{filtered.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Lembar terkoreksi</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rata-Rata Nilai</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{stats.average}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Median: {stats.median}</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nilai Tertinggi</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{stats.highest}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Skor maksimal</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nilai Terendah</p>
          <p className="text-2xl font-black text-rose-600 mt-1">{stats.lowest}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Skor minimal</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Peserta Tuntas</p>
          <p className="text-2xl font-black text-teal-600 mt-1">{stats.passed}</p>
          <p className="text-[10px] text-teal-600 font-semibold mt-0.5">({stats.passRate}%)</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Belum Tuntas</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{stats.failed}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Perlu remedial</p>
        </div>
      </div>

      {/* Filter & Sorting Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau nomor peserta..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Class filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Kelas:</span>
            <select
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white"
            >
              {classes.map(c => (
                <option key={c} value={c}>{c === 'all' ? 'Semua Kelas' : `Kelas ${c}`}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Urutkan:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white"
            >
              <option value="grade_desc">Nilai Tertinggi ke Terendah</option>
              <option value="grade_asc">Nilai Terendah ke Tertinggi</option>
              <option value="name_asc">Nama Peserta (A - Z)</option>
            </select>
          </div>

          {/* KKTP Setter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Batas KKTP:</span>
            <input
              type="number"
              min="50"
              max="95"
              value={kktpValue}
              onChange={e => setKktpValue(parseInt(e.target.value) || 75)}
              className="w-14 px-2 py-1 rounded-lg border border-slate-300 text-center font-bold font-mono"
            />
          </div>
        </div>
      </div>

      {/* Main Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">No</th>
                <th className="py-2.5 px-3">Nomor Peserta</th>
                <th className="py-2.5 px-3">Nama Lengkap Siswa</th>
                <th className="py-2.5 px-3">Kelas</th>
                <th className="py-2.5 px-3 text-center">Benar</th>
                <th className="py-2.5 px-3 text-center">Salah</th>
                <th className="py-2.5 px-3 text-center">Kosong</th>
                <th className="py-2.5 px-3 text-center">Total Skor</th>
                <th className="py-2.5 px-3 text-center font-bold">Nilai Akhir</th>
                <th className="py-2.5 px-3 text-center">Ketuntasan</th>
                <th className="py-2.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400">
                    Belum ada data nilai yang dipindai.
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr key={item.scan.scanId} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{item.studentNum}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{item.studentName}</td>
                    <td className="py-2.5 px-3 text-slate-600">{item.studentClass}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-semibold">{item.correctCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-rose-600 font-semibold">{item.wrongCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400">{item.emptyCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">{item.totalScore} / {item.maxScore}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded font-black text-xs ${
                        item.isPassed ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                      }`}>
                        {item.finalGrade}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.isPassed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          TUNTAS
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          BELUM TUNTAS
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onNavigateToVerification(item.scan.scanId)}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-semibold transition flex items-center gap-1 ml-auto"
                      >
                        <span>Periksa</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
