/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Save,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Edit3,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import {
  ScanResult,
  OMRTemplate,
  AnswerKey,
  Participant,
  SchoolSettings,
  DetectedAnswerStatus
} from '../types/ljk';
import { saveScanResult } from '../services/storage';

interface ManualVerificationViewProps {
  scans: ScanResult[];
  templates: OMRTemplate[];
  answerKeys: AnswerKey[];
  participants: Participant[];
  settings: SchoolSettings;
  selectedScanId?: string;
  onScanUpdated: (updated: ScanResult) => void;
}

export const ManualVerificationView: React.FC<ManualVerificationViewProps> = ({
  scans,
  templates,
  answerKeys,
  participants,
  settings,
  selectedScanId,
  onScanUpdated
}) => {
  const [activeScanId, setActiveScanId] = useState<string>(
    selectedScanId || scans[0]?.scanId || ''
  );
  const [selectedQNum, setSelectedQNum] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [notification, setNotification] = useState<string | null>(null);

  // Active scan
  const activeScan = useMemo(() => {
    return scans.find(s => s.scanId === activeScanId) || scans[0] || null;
  }, [scans, activeScanId]);

  // Active template & key
  const activeTemplate = useMemo(() => {
    if (!activeScan) return null;
    return templates.find(t => t.templateId === activeScan.templateId) || templates[0] || null;
  }, [templates, activeScan]);

  const activeKey = useMemo(() => {
    if (!activeScan) return null;
    return answerKeys.find(k => k.keyId === activeScan.keyId || k.templateId === activeScan.templateId) || null;
  }, [answerKeys, activeScan]);

  // Active participant
  const matchedStudent = useMemo(() => {
    if (!activeScan) return null;
    return participants.find(
      p => p.nomorPeserta === activeScan.studentNumberDetected || p.id === activeScan.participantId
    ) || null;
  }, [participants, activeScan]);

  // Question list sorted
  const questionNumbers = useMemo(() => {
    if (!activeScan) return [];
    return Object.keys(activeScan.questionResults)
      .map(k => parseInt(k, 10))
      .sort((a, b) => a - b);
  }, [activeScan]);

  // Auto-select first question needing check if none selected
  React.useEffect(() => {
    if (activeScan && selectedQNum === null) {
      const needQ = Object.values(activeScan.questionResults).find(
        q => q.status === 'GANDA' || q.status === 'PERLU_VERIFIKASI' || q.status === 'KOSONG'
      );
      if (needQ) {
        setSelectedQNum(needQ.questionNumber);
      } else if (questionNumbers.length > 0) {
        setSelectedQNum(questionNumbers[0]);
      }
    }
  }, [activeScan, questionNumbers]);

  if (!activeScan) {
    return (
      <div className="p-12 text-center text-slate-400">
        <AlertTriangle className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5] mb-2" />
        <h3 className="font-bold text-slate-700 text-sm">Tidak Ada Lembar Scan untuk Diverifikasi</h3>
        <p className="text-xs text-slate-500 mt-1">Silakan lakukan scan LJK terlebih dahulu pada menu "Scan & Koreksi".</p>
      </div>
    );
  }

  // Handle manual answer override for PG or other types
  const handleOverrideAnswer = async (qNum: number, newAnswer: any) => {
    const scanCopy = JSON.parse(JSON.stringify(activeScan)) as ScanResult;
    const qRes = scanCopy.questionResults[qNum];
    if (!qRes) return;

    qRes.detectedAnswer = newAnswer;
    qRes.status = newAnswer ? 'TERISI' : 'KOSONG';
    qRes.verifiedManually = true;

    // Recalculate score against answer key
    const keyItem = activeKey?.questions?.[qNum];
    if (keyItem) {
      if (qRes.type === 'PG') {
        qRes.isCorrect = newAnswer === keyItem.correctAnswer;
        qRes.scoreEarned = qRes.isCorrect ? (keyItem.points || 2) : 0;
      } else if (qRes.type === 'PG_KOMPLEKS') {
        const correctSet = new Set(keyItem.correctAnswer || []);
        const exact = Array.isArray(newAnswer) &&
          newAnswer.length === (keyItem.correctAnswer?.length || 0) &&
          newAnswer.every((x: string) => correctSet.has(x));
        qRes.isCorrect = exact;
        qRes.scoreEarned = exact ? (keyItem.points || 2) : 0;
      }
    }

    // Recalculate total score & final grade
    let newTotal = 0;
    let newMax = 0;
    let anyNeedVerif = false;

    Object.values(scanCopy.questionResults).forEach(q => {
      newTotal += q.scoreEarned || 0;
      newMax += q.maxScore || 2;
      if (q.status === 'GANDA' || q.status === 'PERLU_VERIFIKASI') {
        anyNeedVerif = true;
      }
    });

    scanCopy.totalScore = Math.round(newTotal * 10) / 10;
    scanCopy.maxScore = newMax;
    scanCopy.finalGrade = newMax > 0 ? Math.round((newTotal / newMax) * 1000) / 10 : 0;
    scanCopy.isPassed = scanCopy.finalGrade >= settings.kktp;
    scanCopy.needsVerification = anyNeedVerif;

    await saveScanResult(scanCopy);
    onScanUpdated(scanCopy);
    setNotification(`Jawaban soal ${qNum} diubah menjadi "${Array.isArray(newAnswer) ? newAnswer.join(', ') : newAnswer}". Nilai diperbarui.`);
    setTimeout(() => setNotification(null), 3500);
  };

  // Handle Essay manual score entry
  const handleUpdateEssayScore = async (qNum: number, score: number) => {
    const scanCopy = JSON.parse(JSON.stringify(activeScan)) as ScanResult;
    const qRes = scanCopy.questionResults[qNum];
    if (!qRes) return;

    qRes.scoreEarned = score;
    qRes.verifiedManually = true;
    qRes.status = 'TERISI';

    let newTotal = 0;
    let newMax = 0;
    Object.values(scanCopy.questionResults).forEach(q => {
      newTotal += q.scoreEarned || 0;
      newMax += q.maxScore || 2;
    });

    scanCopy.totalScore = Math.round(newTotal * 10) / 10;
    scanCopy.maxScore = newMax;
    scanCopy.finalGrade = newMax > 0 ? Math.round((newTotal / newMax) * 1000) / 10 : 0;
    scanCopy.isPassed = scanCopy.finalGrade >= settings.kktp;

    await saveScanResult(scanCopy);
    onScanUpdated(scanCopy);
  };

  // Confirm whole sheet as verified
  const handleConfirmSheet = async () => {
    const scanCopy = JSON.parse(JSON.stringify(activeScan)) as ScanResult;
    scanCopy.verificationStatus = 'SUDAH_DIVERIFIKASI';
    scanCopy.needsVerification = false;

    await saveScanResult(scanCopy);
    onScanUpdated(scanCopy);
    setNotification('Lembar jawaban berhasil disahkan dan ditandai terverifikasi.');
    setTimeout(() => setNotification(null), 3000);
  };

  // Active question details
  const activeQ = selectedQNum !== null ? activeScan.questionResults[selectedQNum] : null;
  const activeQKey = selectedQNum !== null ? activeKey?.questions?.[selectedQNum] : null;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Notification Toast */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      {/* Top Sheet Switcher & Student Identity */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
            {activeScan.finalGrade}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                {activeScan.participantName || matchedStudent?.nama || 'Peserta Belum Terdaftar'}
              </h2>
              {activeScan.verificationStatus === 'SUDAH_DIVERIFIKASI' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Terverifikasi
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  Perlu Verifikasi
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono">
              No: {activeScan.studentNumberDetected || matchedStudent?.nomorPeserta || '-'} • Kelas: {activeScan.participantClass || matchedStudent?.kelas || 'IX'} • Skor: {activeScan.totalScore} / {activeScan.maxScore}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          {/* Sheet Selector */}
          <select
            value={activeScan.scanId}
            onChange={e => {
              setActiveScanId(e.target.value);
              setSelectedQNum(null);
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
          >
            {scans.map((s, idx) => (
              <option key={s.scanId} value={s.scanId}>
                #{idx + 1} {s.participantName || s.studentNumberDetected || s.fileName} (Nilai: {s.finalGrade})
              </option>
            ))}
          </select>

          <button
            onClick={handleConfirmSheet}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Sahkan Hasil</span>
          </button>
        </div>
      </div>

      {/* Split Workspace: Left = Sheet Inspector, Right = Answers Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Scanned Sheet Visual Inspector */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>Visualisasi Lembar Scan OMR</span>
              <span className="text-[10px] font-normal text-slate-400">
                (Koreksi Perspektif Normalisasi)
              </span>
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomLevel(z => Math.max(0.7, z - 0.2))}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                title="Perkecil"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[10px] px-1 text-slate-500">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(z => Math.min(2.5, z + 0.2))}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                title="Perbesar"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                title="Reset zoom"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Sheet Container */}
          <div className="relative border border-slate-200 rounded-lg overflow-auto max-h-[580px] bg-slate-100 flex items-center justify-center p-2">
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease'
              }}
              className="relative shadow-md rounded bg-white"
            >
              <img
                src={activeScan.sheetImageDataUrl}
                alt="Warped Scanned LJK"
                className="w-full h-auto max-w-[480px] block"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            Gunakan tombol zoom untuk melihat detail arsiran pensil pada lingkaran bubble.
          </p>
        </div>

        {/* Right: Question Answer Verification Table */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Tabel Jawaban Terbaca</h3>
              <p className="text-xs text-slate-500">Pilih baris soal untuk melihat rasio pixel atau mengubah jawaban</p>
            </div>
          </div>

          {/* Active Question Inspector Card */}
          {activeQ && (
            <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-900">
                  Fokus Soal Nomor {activeQ.questionNumber} ({activeQ.type})
                </span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  Skor: {activeQ.scoreEarned} / {activeQ.maxScore}
                </span>
              </div>

              {/* Measured fill ratios for each option */}
              <div className="text-xs">
                <p className="text-[11px] font-semibold text-slate-600 mb-1">Rasio Keterisian Pixel (Dark Ratio):</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 font-mono text-[11px]">
                  {Object.entries(activeQ.fillRatios).map(([opt, ratio]) => (
                    <div
                      key={opt}
                      className={`p-1.5 rounded border text-center ${
                        ratio >= (settings.omrThreshold || 0.4)
                          ? 'bg-blue-600 text-white font-bold border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] opacity-75">{opt}</div>
                      <div>{Math.round(ratio * 100)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fast Override Buttons for PG */}
              {activeQ.type === 'PG' && (
                <div className="pt-2 border-t border-blue-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Koreksi Manual:</span>
                  <div className="flex gap-1.5">
                    {['A', 'B', 'C', 'D', 'E'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleOverrideAnswer(activeQ.questionNumber, opt)}
                        className={`w-7 h-7 rounded-lg font-bold text-xs transition ${
                          activeQ.detectedAnswer === opt
                            ? 'bg-blue-700 text-white shadow-xs'
                            : 'bg-white hover:bg-blue-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                    <button
                      onClick={() => handleOverrideAnswer(activeQ.questionNumber, null)}
                      className="px-2 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold"
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>
              )}

              {/* Score input for Essay */}
              {(activeQ.type === 'URAIAN_SINGKAT' || activeQ.type === 'URAIAN_PANJANG') && (
                <div className="pt-2 border-t border-blue-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Beri Nilai Uraian Guru:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max={activeQ.maxScore}
                      value={activeQ.scoreEarned}
                      onChange={e => handleUpdateEssayScore(activeQ.questionNumber, parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 rounded border border-slate-300 text-center font-bold"
                    />
                    <span className="text-slate-500 font-mono">/ {activeQ.maxScore} poin</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table List of All Questions */}
          <div className="overflow-y-auto max-h-[380px] border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-2.5">No</th>
                  <th className="py-2 px-2.5">Tipe</th>
                  <th className="py-2 px-2.5">Jawaban Siswa</th>
                  <th className="py-2 px-2.5">Kunci</th>
                  <th className="py-2 px-2.5">Status</th>
                  <th className="py-2 px-2.5 text-center">Skor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questionNumbers.map(qNum => {
                  const q = activeScan.questionResults[qNum];
                  const keyItem = activeKey?.questions?.[qNum];
                  const isSelected = selectedQNum === qNum;

                  return (
                    <tr
                      key={qNum}
                      onClick={() => setSelectedQNum(qNum)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-100/70 font-semibold'
                          : q.status === 'GANDA' || q.status === 'PERLU_VERIFIKASI'
                          ? 'bg-amber-50/60 hover:bg-amber-100/60'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-2.5 font-mono text-slate-500">{qNum}</td>
                      <td className="py-2 px-2.5 text-[10px] text-slate-500">{q.type}</td>
                      <td className="py-2 px-2.5 font-bold text-slate-800">
                        {Array.isArray(q.detectedAnswer)
                          ? q.detectedAnswer.join(', ')
                          : typeof q.detectedAnswer === 'object'
                          ? JSON.stringify(q.detectedAnswer)
                          : q.detectedAnswer || <span className="text-slate-400 font-normal">(Kosong)</span>}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-slate-600">
                        {keyItem
                          ? Array.isArray(keyItem.correctAnswer)
                            ? keyItem.correctAnswer.join(', ')
                            : typeof keyItem.correctAnswer === 'object'
                            ? JSON.stringify(keyItem.correctAnswer)
                            : keyItem.correctAnswer
                          : '-'}
                      </td>
                      <td className="py-2 px-2.5">
                        {q.status === 'GANDA' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            Ganda
                          </span>
                        ) : q.status === 'KOSONG' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            Kosong
                          </span>
                        ) : q.isCorrect ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Benar
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            Salah
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono">
                        {q.scoreEarned}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
