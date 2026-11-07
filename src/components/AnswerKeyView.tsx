/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Save,
  Plus,
  Check,
  AlertCircle,
  Copy,
  Layers,
  Sparkles,
  Trash2,
  Scan,
  Upload,
  Camera,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Eye,
  FileCheck2
} from 'lucide-react';
import {
  AnswerKey,
  OMRTemplate,
  SingleQuestionKey,
  ComplexScoringMode
} from '../types/ljk';
import { saveAnswerKey, deleteAnswerKey } from '../services/storage';
import { processOmrSheet, imageToCanvas, loadImage } from '../services/omrEngine';
import { parseAnswerKeyExcel, downloadSampleAnswerKeyExcel } from '../services/excelService';

interface AnswerKeyViewProps {
  answerKeys: AnswerKey[];
  templates: OMRTemplate[];
  onAnswerKeyUpdated: (key: AnswerKey) => void;
  onAnswerKeyDeleted: (keyId: string) => void;
}

export const AnswerKeyView: React.FC<AnswerKeyViewProps> = ({
  answerKeys,
  templates,
  onAnswerKeyUpdated,
  onAnswerKeyDeleted
}) => {
  const [selectedKeyId, setSelectedKeyId] = useState<string>(
    answerKeys[0]?.keyId || ''
  );

  const activeKey = answerKeys.find(k => k.keyId === selectedKeyId) || answerKeys[0] || null;
  const activeTemplate = templates.find(t => t.templateId === activeKey?.templateId) || templates[0] || null;

  // Local editing state
  const [keyState, setKeyState] = useState<AnswerKey | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Scan Master LJK Modal State
  const [isScanModalOpen, setIsScanModalOpen] = useState<boolean>(false);
  const [isProcessingScan, setIsProcessingScan] = useState<boolean>(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeKey) {
      const copy = JSON.parse(JSON.stringify(activeKey)) as AnswerKey;
      // Normalize any PG_KOMPLEKS questions to ensure correctAnswer is an array
      if (copy.questions) {
        Object.values(copy.questions).forEach(q => {
          if (q.type === 'PG_KOMPLEKS' && !Array.isArray(q.correctAnswer)) {
            if (typeof q.correctAnswer === 'string') {
              q.correctAnswer = q.correctAnswer.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
            } else {
              q.correctAnswer = [];
            }
          }
        });
      }
      setKeyState(copy);
    }
  }, [selectedKeyId, activeKey]);

  if (!keyState || !activeTemplate) {
    return (
      <div className="p-12 text-center text-slate-400">
        <KeyRound className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5] mb-2" />
        <h3 className="font-bold text-slate-700 text-sm">Belum Ada Kunci Jawaban</h3>
        <p className="text-xs text-slate-500 mt-1">Buat template LJK terlebih dahulu untuk menyusun kunci jawaban.</p>
      </div>
    );
  }

  // Handle single PG option selection
  const handleSetPgKey = (qNum: number, opt: string) => {
    setKeyState(prev => {
      if (!prev) return prev;
      const copy = { ...prev };
      copy.questions[qNum] = {
        ...(copy.questions[qNum] || { questionNumber: qNum, type: 'PG', points: 2 }),
        correctAnswer: opt
      };
      return copy;
    });
  };

  // Handle PG Kompleks toggle option
  const handleTogglePgkKey = (qNum: number, opt: string) => {
    setKeyState(prev => {
      if (!prev) return prev;
      const copy = { ...prev };
      const cur = copy.questions[qNum] || { questionNumber: qNum, type: 'PG_KOMPLEKS', points: 2, correctAnswer: [] };
      const rawAns = cur.correctAnswer;
      const arr: string[] = Array.isArray(rawAns)
        ? [...rawAns]
        : typeof rawAns === 'string'
        ? rawAns.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
        : [];
      const idx = arr.indexOf(opt);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(opt);
      arr.sort();
      copy.questions[qNum] = { ...cur, correctAnswer: arr };
      return copy;
    });
  };

  // Handle Benar-Salah statement choice
  const handleSetBsKey = (qNum: number, stmtIdx: number, val: 'B' | 'S') => {
    setKeyState(prev => {
      if (!prev) return prev;
      const copy = { ...prev };
      const cur = copy.questions[qNum] || { questionNumber: qNum, type: 'BENAR_SALAH', points: 2, correctAnswer: {} };
      const sub = typeof cur.correctAnswer === 'object' ? { ...cur.correctAnswer } : {};
      sub[stmtIdx] = val;
      copy.questions[qNum] = { ...cur, correctAnswer: sub };
      return copy;
    });
  };

  // Handle Menjodohkan pair choice
  const handleSetMatchKey = (qNum: number, pairIdx: number, opt: string) => {
    setKeyState(prev => {
      if (!prev) return prev;
      const copy = { ...prev };
      const cur = copy.questions[qNum] || { questionNumber: qNum, type: 'MENJODOHKAN', points: 2, correctAnswer: {} };
      const sub = typeof cur.correctAnswer === 'object' ? { ...cur.correctAnswer } : {};
      sub[pairIdx] = opt;
      copy.questions[qNum] = { ...cur, correctAnswer: sub };
      return copy;
    });
  };

  // Handle Save
  const handleSave = async () => {
    if (!keyState) return;

    let totalPts = 0;
    Object.values(keyState.questions).forEach(q => {
      totalPts += q.points || 0;
    });
    keyState.totalMaxScore = totalPts;

    try {
      await saveAnswerKey(keyState);
      onAnswerKeyUpdated(keyState);
      setNotification({ type: 'success', message: 'Kunci jawaban berhasil disimpan.' });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal menyimpan kunci' });
    }
  };

  // Process master LJK scan from canvas
  const processMasterLjkCanvas = async (canvas: HTMLCanvasElement, sourceName: string) => {
    setIsProcessingScan(true);
    setScanStatusMessage('Mendeteksi penanda OMR dan membaca isian kunci master...');

    try {
      // Process sheet using OMR engine with sensitive master threshold
      const scanResult = await processOmrSheet(
        canvas,
        activeTemplate,
        null,
        `MASTER_${sourceName}`,
        0.35 // sensitive threshold for master sheet pencil/pen marks
      );

      const copy = JSON.parse(JSON.stringify(keyState)) as AnswerKey;
      let detectedCount = 0;

      // Map detected bubbles into answer keys
      for (const [qNumStr, qRes] of Object.entries(scanResult.questionResults)) {
        const qNum = parseInt(qNumStr, 10);
        if (!qRes || qRes.status === 'KOSONG') continue;

        if (qRes.type === 'PG' && typeof qRes.detectedAnswer === 'string' && qRes.detectedAnswer) {
          copy.questions[qNum] = {
            ...(copy.questions[qNum] || { questionNumber: qNum, type: 'PG', points: 2 }),
            correctAnswer: qRes.detectedAnswer
          };
          detectedCount++;
        } else if (qRes.type === 'PG_KOMPLEKS' && Array.isArray(qRes.detectedAnswer) && qRes.detectedAnswer.length > 0) {
          copy.questions[qNum] = {
            ...(copy.questions[qNum] || { questionNumber: qNum, type: 'PG_KOMPLEKS', points: 2 }),
            correctAnswer: qRes.detectedAnswer
          };
          detectedCount++;
        } else if (qRes.type === 'BENAR_SALAH' && typeof qRes.detectedAnswer === 'object' && Object.keys(qRes.detectedAnswer).length > 0) {
          copy.questions[qNum] = {
            ...(copy.questions[qNum] || { questionNumber: qNum, type: 'BENAR_SALAH', points: 2 }),
            correctAnswer: qRes.detectedAnswer
          };
          detectedCount++;
        } else if (qRes.type === 'MENJODOHKAN' && typeof qRes.detectedAnswer === 'object' && Object.keys(qRes.detectedAnswer).length > 0) {
          copy.questions[qNum] = {
            ...(copy.questions[qNum] || { questionNumber: qNum, type: 'MENJODOHKAN', points: 2 }),
            correctAnswer: qRes.detectedAnswer
          };
          detectedCount++;
        }
      }

      setKeyState(copy);
      setIsScanModalOpen(false);
      setIsCameraActive(false);
      setNotification({
        type: 'success',
        message: `Berhasil mengekstrak ${detectedCount} butir kunci jawaban dari file/scan LJK Master! Silakan periksa dan klik "Simpan Kunci".`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: `Gagal membaca LJK master: ${err.message || 'Pastikan 4 sudut penanda LJK terlihat jelas'}`
      });
    } finally {
      setIsProcessingScan(false);
      setScanStatusMessage('');
    }
  };

  // Upload file handler (Image or PDF)
  const handleUploadMasterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.type === 'application/pdf') {
        setIsProcessingScan(true);
        setScanStatusMessage('Membuka file PDF LJK Master...');
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await (page.render as any)({ canvasContext: ctx, viewport, canvas }).promise;

        await processMasterLjkCanvas(canvas, file.name);
      } else if (file.type.startsWith('image/')) {
        setIsProcessingScan(true);
        setScanStatusMessage('Membaca gambar LJK Master...');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const img = await loadImage(dataUrl);
        const canvas = imageToCanvas(img);
        await processMasterLjkCanvas(canvas, file.name);
      }
    } catch (err: any) {
      setIsProcessingScan(false);
      setNotification({ type: 'error', message: `Gagal memproses file: ${err.message}` });
    }
  };

  // Import from Excel file
  const handleImportExcelKeys = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsedKeys = await parseAnswerKeyExcel(file);
      const copy = JSON.parse(JSON.stringify(keyState)) as AnswerKey;
      let count = 0;

      for (const [qNumStr, item] of Object.entries(parsedKeys)) {
        const qNum = parseInt(qNumStr, 10);
        if (copy.questions[qNum]) {
          const qType = copy.questions[qNum].type;
          let ans = item.answer;

          if (qType === 'PG_KOMPLEKS') {
            ans = Array.isArray(ans)
              ? ans
              : typeof ans === 'string'
              ? ans.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
              : [String(ans)];
          } else if (qType === 'BENAR_SALAH' || qType === 'MENJODOHKAN') {
            if (typeof ans !== 'object' || ans === null) {
              const parts = String(ans).split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
              const obj: Record<number, string> = {};
              parts.forEach((p, idx) => { obj[idx] = p; });
              ans = obj;
            }
          }

          copy.questions[qNum].correctAnswer = ans;
          if (item.points !== undefined) copy.questions[qNum].points = item.points;
          count++;
        }
      }

      setKeyState(copy);
      setNotification({
        type: 'success',
        message: `Berhasil mengimpor ${count} kunci jawaban dari file Excel.`
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: `Gagal membaca Excel: ${err.message}` });
    }
  };

  // Camera start
  const handleStartCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Tidak dapat mengakses kamera. Pastikan izin kamera aktif.');
      setIsCameraActive(false);
    }
  };

  // Capture frame from webcam for master LJK
  const handleCaptureCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Stop stream
    const stream = video.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    setIsCameraActive(false);

    await processMasterLjkCanvas(canvas, 'CAMERA');
  };

  // Group questions by type from template
  const pgConfigs = activeTemplate.questions.filter(q => q.type === 'PG' && q.enabled);
  const pgkConfigs = activeTemplate.questions.filter(q => q.type === 'PG_KOMPLEKS' && q.enabled);
  const bsConfigs = activeTemplate.questions.filter(q => q.type === 'BENAR_SALAH' && q.enabled);
  const matchConfigs = activeTemplate.questions.filter(q => q.type === 'MENJODOHKAN' && q.enabled);
  const essayConfigs = activeTemplate.questions.filter(q => (q.type === 'URAIAN_SINGKAT' || q.type === 'URAIAN_PANJANG') && q.enabled);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      {/* Header bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">Kunci Jawaban Ujian</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {keyState.examTitle} • Mapel: {keyState.subject} • Kelas: {keyState.grade}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Template / Key Selector */}
          <select
            value={selectedKeyId}
            onChange={e => setSelectedKeyId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
          >
            {answerKeys.map(k => (
              <option key={k.keyId} value={k.keyId}>
                {k.subject} ({k.grade} - {k.academicYear})
              </option>
            ))}
          </select>

          {/* New Feature Button: Scan / Upload LJK Master */}
          <button
            type="button"
            onClick={() => setIsScanModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-sky-50 text-sky-800 border border-sky-300 hover:bg-sky-100 text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
            title="Scan atau upload lembar LJK yang telah diarsir untuk mengisi kunci jawaban secara otomatis"
          >
            <Scan className="w-4 h-4 text-sky-600" />
            <span>Scan / Upload LJK Master</span>
          </button>

          {/* Import Excel */}
          <label className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition">
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Import Excel</span>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleImportExcelKeys}
              className="hidden"
            />
          </label>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Kunci</span>
          </button>
        </div>
      </div>

      {/* Scoring Mode Settings Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div>
          <span className="font-bold text-slate-800 block">Metode Penilaian PG Kompleks</span>
          <span className="text-slate-500 text-[11px]">
            Tentukan bagaimana skor dihitung jika siswa memilih jawaban sebagian benar.
          </span>
        </div>

        <div className="flex gap-2">
          {[
            { id: 'full_only', label: 'Benar Penuh Saja (Semua Tepat)' },
            { id: 'partial', label: 'Skor Parsial Proporsional' }
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setKeyState({ ...keyState, complexScoringMode: m.id as ComplexScoringMode })}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                keyState.complexScoringMode === m.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bagian A: Pilihan Ganda (PG) Grid */}
      {pgConfigs.map(cfg => (
        <div key={cfg.type} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Bagian A. Kunci Jawaban Pilihan Ganda ({cfg.numbers.length} Soal)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">Bobot: {cfg.pointsPerItem} poin / butir</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-3">
            {cfg.numbers.map(qNum => {
              const currentAns = keyState.questions[qNum]?.correctAnswer;
              const options = ['A', 'B', 'C', 'D'].slice(0, cfg.optionsCount || 4);

              return (
                <div key={qNum} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-center">
                  <span className="font-bold text-xs text-slate-700 block mb-1.5">{qNum}</span>
                  <div className="flex justify-center gap-1">
                    {options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleSetPgKey(qNum, opt)}
                        className={`w-6 h-6 rounded font-bold text-[11px] transition ${
                          currentAns === opt
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bagian B: PG Kompleks Grid */}
      {pgkConfigs.map(cfg => (
        <div key={cfg.type} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Bagian B. Kunci PG Kompleks (Pilihan Lebih Dari 1 - {cfg.numbers.length} Soal)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">Bobot: {cfg.pointsPerItem} poin / butir</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {cfg.numbers.map(qNum => {
              const rawAns = keyState.questions[qNum]?.correctAnswer;
              const selectedArr: string[] = Array.isArray(rawAns)
                ? rawAns
                : typeof rawAns === 'string'
                ? rawAns.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
                : [];
              const options = ['A', 'B', 'C', 'D'];

              return (
                <div key={qNum} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-xs text-slate-800">Soal {qNum}</span>
                    <span className="font-mono text-[10px] text-blue-600 font-bold">
                      [{selectedArr.join(', ')}]
                    </span>
                  </div>
                  <div className="flex justify-center gap-1.5">
                    {options.map(opt => {
                      const isChecked = selectedArr.includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => handleTogglePgkKey(qNum, opt)}
                          className={`flex-1 py-1 rounded font-bold text-xs transition ${
                            isChecked
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bagian C: Benar - Salah Grid */}
      {bsConfigs.map(cfg => (
        <div key={cfg.type} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Bagian C. Kunci Benar - Salah ({cfg.numbers.length} Soal)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">Bobot: {cfg.pointsPerItem} poin / butir</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cfg.numbers.map(qNum => {
              const rawBs = keyState.questions[qNum]?.correctAnswer;
              const curMap: Record<number, string> = {};
              if (rawBs && typeof rawBs === 'object' && !Array.isArray(rawBs)) {
                Object.entries(rawBs).forEach(([k, v]) => { curMap[Number(k)] = String(v); });
              } else if (Array.isArray(rawBs)) {
                rawBs.forEach((v, idx) => { curMap[idx] = String(v); });
              } else if (typeof rawBs === 'string') {
                rawBs.split(/[,;\s]+/).filter(Boolean).forEach((v, idx) => { curMap[idx] = v.trim().toUpperCase(); });
              }
              const stmtsCount = cfg.subItemsCount || 3;
              const stmts = Array.from({ length: stmtsCount }, (_, i) => `Pernyataan ${String.fromCharCode(65 + i)}`);

              return (
                <div key={qNum} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <span className="font-bold text-xs text-slate-800 block">Nomor Soal {qNum}:</span>
                  {stmts.map((stmtName, sIdx) => {
                    const val = curMap[sIdx];
                    return (
                      <div key={sIdx} className="flex items-center justify-between text-xs bg-white p-1.5 rounded border border-slate-200">
                        <span className="text-slate-600 font-medium">{stmtName}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleSetBsKey(qNum, sIdx, 'B')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              val === 'B' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            Benar
                          </button>
                          <button
                            onClick={() => handleSetBsKey(qNum, sIdx, 'S')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              val === 'S' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            Salah
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bagian D: Menjodohkan Grid */}
      {matchConfigs.map(cfg => (
        <div key={cfg.type} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Bagian D. Kunci Menjodohkan ({cfg.numbers.length} Soal)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">Bobot: {cfg.pointsPerItem} poin / butir</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cfg.numbers.map(qNum => {
              const rawMatch = keyState.questions[qNum]?.correctAnswer;
              const curMap: Record<number, string> = {};
              if (rawMatch && typeof rawMatch === 'object' && !Array.isArray(rawMatch)) {
                Object.entries(rawMatch).forEach(([k, v]) => { curMap[Number(k)] = String(v); });
              } else if (Array.isArray(rawMatch)) {
                rawMatch.forEach((v, idx) => { curMap[idx] = String(v); });
              } else if (typeof rawMatch === 'string') {
                rawMatch.split(/[,;\s]+/).filter(Boolean).forEach((v, idx) => { curMap[idx] = v.trim().toUpperCase(); });
              }
              const pairsCount = cfg.subItemsCount || 4;
              const pairs = Array.from({ length: pairsCount }, (_, i) => i + 1);
              const opts = ['A', 'B', 'C', 'D', 'E'];

              return (
                <div key={qNum} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <span className="font-bold text-xs text-slate-800 block">Nomor Soal {qNum}:</span>
                  {pairs.map((pNum, pIdx) => {
                    const val = curMap[pIdx];
                    return (
                      <div key={pIdx} className="flex items-center justify-between text-xs bg-white p-1.5 rounded border border-slate-200">
                        <span className="text-slate-600 font-medium">Item {pNum}</span>
                        <div className="flex gap-1">
                          {opts.map(opt => (
                            <button
                              key={opt}
                              onClick={() => handleSetMatchKey(qNum, pIdx, opt)}
                              className={`w-6 h-6 rounded text-[11px] font-bold ${
                                val === opt ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* MODAL: Scan / Upload LJK Master */}
      {isScanModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Scan className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Isi Kunci dari Scan LJK Master</h3>
                  <p className="text-[11px] text-slate-500">Upload atau foto lembar LJK yang sudah diarsir kunci jawabannya</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach(t => t.stop());
                  setIsCameraActive(false);
                  setIsScanModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Processing indicator */}
            {isProcessingScan ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-800">{scanStatusMessage}</p>
                <p className="text-[11px] text-slate-400">Sistem sedang meluruskan kemiringan & membaca lingkaran bubble...</p>
              </div>
            ) : isCameraActive ? (
              /* Camera view */
              <div className="space-y-3">
                <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-4 border-2 border-dashed border-sky-400 rounded pointer-events-none"></div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const stream = videoRef.current?.srcObject as MediaStream;
                      stream?.getTracks().forEach(t => t.stop());
                      setIsCameraActive(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    Batal Kamera
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptureCamera}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                  >
                    Foto & Baca Kunci
                  </button>
                </div>
              </div>
            ) : (
              /* Upload Options */
              <div className="space-y-3 text-xs">
                {/* Upload File Box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/30 flex flex-col items-center justify-center"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, application/pdf"
                    onChange={handleUploadMasterFile}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="font-bold text-slate-800">Upload Foto atau PDF Lembar Kunci</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Mendukung format JPG, PNG, atau PDF</p>
                  <span className="mt-2.5 px-3 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold">
                    Pilih File dari Perangkat
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  {/* Camera scan button */}
                  <button
                    type="button"
                    onClick={handleStartCamera}
                    className="p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <Camera className="w-4 h-4 text-slate-600" />
                    <span>Scan dari Kamera</span>
                  </button>

                  {/* Download format Excel */}
                  <button
                    type="button"
                    onClick={downloadSampleAnswerKeyExcel}
                    className="p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <Download className="w-4 h-4 text-slate-600" />
                    <span>Format File Excel</span>
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <span className="font-bold text-slate-800 block">💡 Tips Memindai Lembar Kunci:</span>
                  <p>1. Ambil 1 lembar LJK kosong dan arsir penuh bulatan jawaban yang benar.</p>
                  <p>2. Pastikan ke-4 kotak hitam sudut lembar (*registration marks*) tampak jelas tanpa terpotong.</p>
                  <p>3. Setelah dibaca, seluruh jawaban akan langsung terisi pada tabel di layar dan dapat Anda tinjau sebelum disimpan.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
