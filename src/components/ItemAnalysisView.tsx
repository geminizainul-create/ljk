/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  HelpCircle,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Lightbulb
} from 'lucide-react';
import { ScanResult, AnswerKey, OMRTemplate, SchoolSettings } from '../types/ljk';
import { exportItemAnalysisToExcel } from '../services/excelService';

interface ItemAnalysisViewProps {
  scans: ScanResult[];
  answerKeys: AnswerKey[];
  templates: OMRTemplate[];
  settings: SchoolSettings;
}

export const ItemAnalysisView: React.FC<ItemAnalysisViewProps> = ({
  scans,
  answerKeys,
  templates,
  settings
}) => {
  const activeTemplate = templates[0];
  const activeKey = answerKeys.find(k => k.templateId === activeTemplate?.templateId) || answerKeys[0];

  // Psychometric Item Analysis Calculations
  const analysisData = useMemo(() => {
    if (!activeTemplate || scans.length === 0) return [];

    const totalStudents = scans.length;

    // Sort students by total grade for Upper Group (Kelompok Atas) vs Lower Group (Kelompok Bawah)
    const sortedScans = [...scans].sort((a, b) => b.finalGrade - a.finalGrade);
    const groupSize = Math.max(1, Math.floor(totalStudents * 0.33));
    const upperGroup = sortedScans.slice(0, groupSize);
    const lowerGroup = sortedScans.slice(totalStudents - groupSize);

    // Collect all question numbers
    const allQNums = new Set<number>();
    activeTemplate.questions.forEach(q => {
      if (q.enabled) q.numbers.forEach(n => allQNums.add(n));
    });
    const sortedNums = Array.from(allQNums).sort((a, b) => a - b);

    return sortedNums.map(qNum => {
      const keyItem = activeKey?.questions?.[qNum];
      const qType = keyItem?.type || 'PG';
      const correctAnswer = keyItem?.correctAnswer;

      let correctCount = 0;
      let wrongCount = 0;
      let blankCount = 0;
      const optDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };

      // Upper and Lower group correct count for Discrimination Index
      let upperCorrect = 0;
      let lowerCorrect = 0;

      scans.forEach(scan => {
        const qRes = scan.questionResults[qNum];
        if (!qRes || qRes.status === 'KOSONG') {
          blankCount++;
        } else if (qRes.isCorrect) {
          correctCount++;
        } else {
          wrongCount++;
        }

        // Tally option distributions for PG
        if (qRes && typeof qRes.detectedAnswer === 'string' && optDistribution[qRes.detectedAnswer] !== undefined) {
          optDistribution[qRes.detectedAnswer]++;
        }
      });

      // Upper group calculation
      upperGroup.forEach(s => {
        if (s.questionResults[qNum]?.isCorrect) upperCorrect++;
      });
      // Lower group calculation
      lowerGroup.forEach(s => {
        if (s.questionResults[qNum]?.isCorrect) lowerCorrect++;
      });

      // Facility Index (Tingkat Kesukaran) P = Correct / N
      const pIndex = totalStudents > 0 ? correctCount / totalStudents : 0;
      const percentCorrect = Math.round(pIndex * 100);

      let difficultyText = 'Sedang';
      let difficultyColor = 'text-blue-600 bg-blue-50 border-blue-200';
      if (pIndex > 0.70) {
        difficultyText = 'Mudah';
        difficultyColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      } else if (pIndex < 0.30) {
        difficultyText = 'Sukar';
        difficultyColor = 'text-rose-700 bg-rose-50 border-rose-200';
      }

      // Discrimination Index D = (UpperCorrect - LowerCorrect) / GroupSize
      let discriminationIndex: number | undefined = undefined;
      let discText = 'Cukup';
      let discColor = 'text-slate-600 bg-slate-50';

      if (totalStudents >= 4) {
        discriminationIndex = Math.round(((upperCorrect - lowerCorrect) / groupSize) * 100) / 100;
        if (discriminationIndex >= 0.40) {
          discText = 'Sangat Baik';
          discColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        } else if (discriminationIndex >= 0.30) {
          discText = 'Baik';
          discColor = 'text-teal-700 bg-teal-50 border-teal-200';
        } else if (discriminationIndex >= 0.20) {
          discText = 'Cukup';
          discColor = 'text-blue-700 bg-blue-50 border-blue-200';
        } else {
          discText = 'Perlu Direvisi';
          discColor = 'text-amber-700 bg-amber-50 border-amber-200';
        }
      }

      // Teacher Recommendation
      let recommendation = 'Kualitas butir soal seimbang dan dapat dipertahankan di bank soal.';
      if (totalStudents < 3) {
        recommendation = 'Data peserta belum memadai untuk kesimpulan definitif.';
      } else if (pIndex < 0.25) {
        recommendation = 'Soal terlalu sukar atau indikator kompetensi belum tuntas dipahami siswa. Disarankan ulasan materi.';
      } else if (pIndex > 0.90) {
        recommendation = 'Soal sangat mudah. Sebagian besar siswa dapat menjawab benar. Pertimbangkan menaikkan level kognitif.';
      } else if (discriminationIndex !== undefined && discriminationIndex < 0.15) {
        recommendation = 'Daya pembeda rendah. Pengecoh (distraktor) mungkin kurang berfungsi optimal atau kunci ambigu.';
      }

      return {
        questionNumber: qNum,
        type: qType,
        correctAnswer: correctAnswer || '-',
        correctCount,
        wrongCount,
        blankCount,
        percentCorrect,
        pIndex,
        difficultyText,
        difficultyColor,
        discriminationIndex,
        discText,
        discColor,
        optDistribution,
        recommendation
      };
    });
  }, [scans, activeTemplate, activeKey]);

  const handleExport = () => {
    exportItemAnalysisToExcel(
      analysisData,
      activeTemplate?.name || 'PSAJ 2026',
      settings
    );
  };

  if (scans.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400">
        <BarChart3 className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5] mb-2" />
        <h3 className="font-bold text-slate-700 text-sm">Belum Ada Data Hasil Ujian</h3>
        <p className="text-xs text-slate-500 mt-1">Lakukan scan lembar LJK terlebih dahulu untuk menghasilkan analisis butir soal.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">Analisis Butir Soal & Daya Pembeda</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sampel: {scans.length} lembar jawaban siswa • Ujian: {activeTemplate?.exam?.namaUjian || 'PSAJ IX'}
          </p>
        </div>

        <button
          onClick={handleExport}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm self-start md:self-auto"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Ekspor Analisis ke Excel</span>
        </button>
      </div>

      {/* Psychometrics Explanation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <p className="font-bold text-slate-800 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            Tingkat Kesukaran (P)
          </p>
          <p className="text-[11px] text-slate-500 leading-normal">
            Mudah (P &gt; 0.70), Sedang (0.30 - 0.70), Sukar (P &lt; 0.30). Soal baik umumnya berkisar pada rentang Sedang.
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <p className="font-bold text-slate-800 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
            Daya Pembeda (D)
          </p>
          <p className="text-[11px] text-slate-500 leading-normal">
            Membedakan siswa kelompok atas dan bawah. D &ge; 0.30 tergolong baik. D &lt; 0.20 memerlukan revisi pengecoh.
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <p className="font-bold text-slate-800 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            Rekomendasi Guru
          </p>
          <p className="text-[11px] text-slate-500 leading-normal">
            Saran pedagogis otomatis untuk bank soal sekolah dan perencanaan remedial materi.
          </p>
        </div>
      </div>

      {/* Main Analysis Cards List */}
      <div className="space-y-3.5">
        {analysisData.map(item => (
          <div
            key={item.questionNumber}
            className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Question Header & Correctness */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-extrabold text-sm flex items-center justify-center flex-shrink-0">
                  {item.questionNumber}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-800">
                      Tipe: {item.type} • Kunci: <span className="font-mono text-blue-600 font-black">{typeof item.correctAnswer === 'object' ? JSON.stringify(item.correctAnswer) : item.correctAnswer}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.difficultyColor}`}>
                      {item.difficultyText} ({item.percentCorrect}%)
                    </span>
                    {item.discriminationIndex !== undefined && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.discColor}`}>
                        Daya Pembeda: {item.discriminationIndex} ({item.discText})
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span>{item.recommendation}</span>
                  </p>
                </div>
              </div>

              {/* Stats & Distribution */}
              <div className="flex items-center gap-6 text-xs">
                {/* Numbers breakdown */}
                <div className="flex gap-3 text-center font-mono">
                  <div className="p-1.5 rounded bg-emerald-50 text-emerald-800">
                    <div className="text-[10px] uppercase font-bold text-emerald-600">Benar</div>
                    <div className="font-bold">{item.correctCount}</div>
                  </div>
                  <div className="p-1.5 rounded bg-rose-50 text-rose-800">
                    <div className="text-[10px] uppercase font-bold text-rose-600">Salah</div>
                    <div className="font-bold">{item.wrongCount}</div>
                  </div>
                  <div className="p-1.5 rounded bg-slate-100 text-slate-700">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Kosong</div>
                    <div className="font-bold">{item.blankCount}</div>
                  </div>
                </div>

                {/* Option Bars for PG */}
                {item.type === 'PG' && (
                  <div className="hidden sm:flex items-center gap-1.5 border-l border-slate-200 pl-4 font-mono text-[10px]">
                    {['A', 'B', 'C', 'D'].map(opt => {
                      const count = item.optDistribution[opt] || 0;
                      const isKey = item.correctAnswer === opt;
                      return (
                        <div key={opt} className="text-center w-8">
                          <span className={`font-bold block ${isKey ? 'text-blue-600 font-black' : 'text-slate-500'}`}>
                            {opt}
                          </span>
                          <span className="text-slate-700 block">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
