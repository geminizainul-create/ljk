/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Scan,
  Upload,
  Camera,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sliders,
  Play,
  ArrowRight,
  Eye,
  RefreshCw,
  Trash2,
  Layers,
  Smartphone,
  Zap,
  ZapOff,
  SwitchCamera,
  X,
  Check,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  OMRTemplate,
  AnswerKey,
  ScanResult,
  SchoolSettings,
  Participant
} from '../types/ljk';
import { processOmrSheet, imageToCanvas, loadImage, QuadCorners } from '../services/omrEngine';
import { generateSyntheticScanCanvas } from '../services/syntheticGenerator';
import { saveScanResult } from '../services/storage';

interface OmrScannerViewProps {
  templates: OMRTemplate[];
  answerKeys: AnswerKey[];
  participants: Participant[];
  settings: SchoolSettings;
  onScanCompleted: (result: ScanResult) => void;
  onNavigateToVerification: (scanId: string) => void;
}

export const OmrScannerView: React.FC<OmrScannerViewProps> = ({
  templates,
  answerKeys,
  participants,
  settings,
  onScanCompleted,
  onNavigateToVerification
}) => {
  // Selected template & key
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.templateId || ''
  );
  const activeTemplate = templates.find(t => t.templateId === selectedTemplateId) || templates[0];
  const activeKey = answerKeys.find(k => k.templateId === activeTemplate?.templateId) || answerKeys[0] || null;

  // Sensitivity threshold
  const [threshold, setThreshold] = useState<number>(settings.omrThreshold || 0.40);

  // File queue & processing state
  const [queue, setQueue] = useState<{ id: string; name: string; canvas: HTMLCanvasElement; previewUrl: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Camera & Mobile Scan state
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [batchMode, setBatchMode] = useState<boolean>(true);
  const [batchToast, setBatchToast] = useState<string | null>(null);
  const [showAndroidTips, setShowAndroidTips] = useState<boolean>(false);
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;
      setIsMobileDevice(isMobileUA || isNarrow);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update selected template if templates array changes
  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      setSelectedTemplateId(templates[0].templateId);
    }
  }, [templates]);

  // Handle uploaded images & PDFs
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);

    const newQueueItems: { id: string; name: string; canvas: HTMLCanvasElement; previewUrl: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        if (file.type === 'application/pdf') {
          // Render PDF pages via pdfjs-dist
          try {
            const pdfjsLib = await import('pdfjs-dist');
            // Configure worker
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for sharp OCR/OMR
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d')!;

              await (page.render as any)({ canvasContext: ctx, viewport, canvas }).promise;

              newQueueItems.push({
                id: `pdf-${Date.now()}-${pageNum}`,
                name: `${file.name} (Hal ${pageNum})`,
                canvas,
                previewUrl: canvas.toDataURL('image/jpeg', 0.8)
              });
            }
          } catch (pdfErr) {
            console.error('PDF rendering failed:', pdfErr);
            setErrorMsg(`Gagal membaca file PDF "${file.name}". Pastikan file tidak terkunci sandi.`);
          }
        } else if (file.type.startsWith('image/')) {
          // Image file (JPG/PNG)
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const img = await loadImage(dataUrl);
          const canvas = imageToCanvas(img);

          newQueueItems.push({
            id: `img-${Date.now()}-${i}`,
            name: file.name,
            canvas,
            previewUrl: dataUrl
          });
        }
      } catch (err: any) {
        console.error('File load error:', err);
      }
    }

    setQueue(prev => [...prev, ...newQueueItems]);
  };

  // Run OMR Processing on Queue
  const handleStartProcessing = async () => {
    if (!activeTemplate) {
      setErrorMsg('Pilih template LJK terlebih dahulu');
      return;
    }
    if (queue.length === 0) {
      setErrorMsg('Silakan pilih atau upload file hasil scan terlebih dahulu');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: queue.length });
    const results: ScanResult[] = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setProgress({ current: i + 1, total: queue.length });

      try {
        const scanResult = await processOmrSheet(
          item.canvas,
          activeTemplate,
          activeKey,
          item.name,
          threshold
        );

        // Auto-match student by detected Nomor Peserta
        if (scanResult.studentNumberDetected) {
          const matched = participants.find(
            p => p.nomorPeserta.replace(/\D/g, '') === scanResult.studentNumberDetected?.replace(/\D/g, '')
          );
          if (matched) {
            scanResult.participantId = matched.id;
            scanResult.participantName = matched.nama;
            scanResult.participantClass = matched.kelas;
          }
        }

        await saveScanResult(scanResult);
        results.push(scanResult);
        onScanCompleted(scanResult);
      } catch (err) {
        console.error('Error processing sheet:', err);
      }
    }

    setRecentScans(results);
    setQueue([]);
    setIsProcessing(false);
  };

  // Run Test Simulation with Synthetic Filled Sheet
  const handleRunSimulation = async () => {
    if (!activeTemplate) return;

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      // Pick random student from participants
      const randomStudent = participants[Math.floor(Math.random() * participants.length)] || {
        nomorPeserta: '09-001',
        nama: 'ACHMAD FADILLAH',
        kelas: 'IX-A'
      };

      const synthetic = await generateSyntheticScanCanvas({
        template: activeTemplate,
        answerKey: activeKey,
        studentNumber: randomStudent.nomorPeserta,
        fillAccuracy: 0.88,
        introduceDoubleMark: true,
        introduceBlank: true,
        introduceTiltAngle: 0.6 // Realistic 0.6 degree tilt
      });

      // Process via OMR engine
      const scanResult = await processOmrSheet(
        synthetic.canvas,
        activeTemplate,
        activeKey,
        `SIMULASI_${randomStudent.nama.replace(/\s+/g, '_')}.png`,
        threshold
      );

      scanResult.participantId = randomStudent.id;
      scanResult.participantName = randomStudent.nama;
      scanResult.participantClass = randomStudent.kelas;

      await saveScanResult(scanResult);
      setRecentScans(prev => [scanResult, ...prev]);
      onScanCompleted(scanResult);
    } catch (err: any) {
      setErrorMsg(`Gagal menjalankan simulasi: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Stop camera stream safely
  const stopCameraStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsTorchOn(false);
    setTorchSupported(false);
    setIsCameraOpen(false);
    setBatchToast(null);
  };

  // Webcam & Mobile Camera capture start
  const handleStartCamera = async (overrideFacingMode?: 'environment' | 'user') => {
    const targetFacing = overrideFacingMode || facingMode;
    // Stop any existing stream
    if (videoRef.current && videoRef.current.srcObject) {
      const oldStream = videoRef.current.srcObject as MediaStream;
      oldStream.getTracks().forEach(t => t.stop());
    }

    try {
      setIsCameraOpen(true);
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Video play error:', e));
      }

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities ? (track.getCapabilities() as any) : {}) || {};
        if (capabilities.torch) {
          setTorchSupported(true);
        } else {
          setTorchSupported(false);
        }
      }
    } catch (err) {
      console.error('Camera access error:', err);
      alert('Tidak dapat mengakses kamera. Pastikan izin kamera telah diizinkan pada browser HP Anda.');
      setIsCameraOpen(false);
    }
  };

  // Toggle flashlight / torch
  const handleToggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && torchSupported) {
      try {
        const nextState = !isTorchOn;
        await (track.applyConstraints as any)({
          advanced: [{ torch: nextState }]
        });
        setIsTorchOn(nextState);
      } catch (err) {
        console.warn('Torch toggle failed:', err);
      }
    }
  };

  // Switch between back and front camera
  const handleSwitchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    handleStartCamera(nextMode);
  };

  // Capture frame from webcam / live viewfinder
  const handleCaptureCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Haptic feedback for touch devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(60); } catch (_) {}
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newItem = {
      id: `cam-${Date.now()}`,
      name: `Scan Kamera (${nowStr})`,
      canvas,
      previewUrl: canvas.toDataURL('image/jpeg', 0.85)
    };

    setQueue(prev => [...prev, newItem]);

    if (batchMode) {
      setBatchToast(`✓ Lembar LJK berhasil difoto! Total antrean: ${queue.length + 1}`);
      setTimeout(() => setBatchToast(null), 2400);
    } else {
      stopCameraStream();
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Hidden Inputs for File & Native Android Camera */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png, image/jpeg, image/jpg, application/pdf"
        onChange={e => handleFilesSelected(e.target.files)}
        className="hidden"
      />
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={e => handleFilesSelected(e.target.files)}
        className="hidden"
      />

      {/* Error notification */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="font-bold text-slate-400 hover:text-slate-600 p-1">✕</button>
        </div>
      )}

      {/* Quick Action Card Khusus Android / Smartphone */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-blue-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-blue-500/30 flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  Pemindai Kamera Android / Smartphone
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Mode HP
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Scan LJK cepat dengan kamera HP beresolusi tinggi dan panduan sudut otomatis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowAndroidTips(prev => !prev)}
              className="text-xs text-sky-200 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showAndroidTips ? 'Sembunyikan Tips' : 'Tips Scan HP'}</span>
              {showAndroidTips ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Collapsible Android Tips */}
        {showAndroidTips && (
          <div className="mt-3.5 pt-3.5 border-t border-blue-800/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-blue-100 animate-fadeIn">
            <div className="p-3 rounded-xl bg-blue-950/70 border border-blue-800/50">
              <span className="font-bold text-sky-300 flex items-center gap-1 mb-1">
                <span>1. Posisi HP Tegak Lurus</span>
              </span>
              <p className="text-[11px] text-blue-200 leading-relaxed">
                Pegang HP sejajar 35–45 cm di atas meja tepat di atas kertas (jangan miring tajam).
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-950/70 border border-blue-800/50">
              <span className="font-bold text-sky-300 flex items-center gap-1 mb-1">
                <span>2. 4 Kotak Sudut Masuk</span>
              </span>
              <p className="text-[11px] text-blue-200 leading-relaxed">
                Pastikan 2 kotak penanda atas dan 2 kotak sebelum uraian terlihat utuh tidak terpotong.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-950/70 border border-blue-800/50">
              <span className="font-bold text-sky-300 flex items-center gap-1 mb-1">
                <span>3. Pencahayaan & Bayangan</span>
              </span>
              <p className="text-[11px] text-blue-200 leading-relaxed">
                Hindari bayangan tangan/HP menutupi bulatan LJK. Gunakan lampu ruangan atau senter kamera.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons for Mobile */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Button 1: Native Android Camera */}
          <button
            type="button"
            onClick={() => mobileCameraInputRef.current?.click()}
            className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
          >
            <Camera className="w-4 h-4 flex-shrink-0" />
            <span>Kamera Bawaan HP (Autofokus)</span>
          </button>

          {/* Button 2: Interactive Realtime Viewfinder */}
          <button
            type="button"
            onClick={() => handleStartCamera('environment')}
            className="py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition border border-blue-400/30"
          >
            <Scan className="w-4 h-4 flex-shrink-0" />
            <span>Pemindai Realtime (Viewfinder)</span>
          </button>

          {/* Button 3: Gallery / PDF Upload */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-2 transition border border-white/10"
          >
            <Upload className="w-4 h-4 flex-shrink-0" />
            <span>Pilih File Scan / PDF</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Select Template & Sensitivitas OMR */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-5">
          <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Template LJK Target</label>
          <select
            value={selectedTemplateId}
            onChange={e => setSelectedTemplateId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500/20"
          >
            {templates.map(t => (
              <option key={t.templateId} value={t.templateId}>
                {t.name} ({t.questions.reduce((a, b) => a + (b.enabled ? b.numbers.length : 0), 0)} soal)
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4">
          <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
            <span>Ambang Keterisian (OMR Threshold)</span>
            <span className="font-mono text-blue-600 font-bold">{Math.round(threshold * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.20"
            max="0.70"
            step="0.05"
            value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
            <span>Lebih Sensitif</span>
            <span>Standar 2B</span>
            <span>Ketat (Pekat)</span>
          </div>
        </div>

        <div className="md:col-span-3 flex justify-end">
          <button
            onClick={handleRunSimulation}
            disabled={isProcessing}
            className="w-full py-2.5 px-3.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-300 hover:bg-sky-100 text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs disabled:opacity-50"
            title="Generate lembar LJK sintetis dengan pensil realistis dan uji pembacaan"
          >
            <Sparkles className="w-4 h-4 text-sky-600" />
            <span>Uji Coba LJK Sintetis</span>
          </button>
        </div>
      </div>

      {/* Upload Zone & Action Buttons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Upload dropzone card */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-2xs flex flex-col justify-between">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleFilesSelected(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/30 flex flex-col items-center justify-center min-h-[190px]"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-inner">
              <Upload className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <p className="font-bold text-sm text-slate-800">
              Tarik & Lepaskan File Scan LJK ke Sini
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Mendukung file <span className="font-semibold text-slate-700">PDF Multi-Halaman, JPG, atau PNG</span>
            </p>
            <span className="mt-3 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs">
              Pilih File Scan dari Perangkat
            </span>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              onClick={() => handleStartCamera('environment')}
              className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <Camera className="w-4 h-4 text-slate-600" />
              <span>Buka Kamera Viewfinder</span>
            </button>

            {queue.length > 0 && (
              <button
                onClick={handleStartProcessing}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Membaca {progress.current} dari {progress.total}...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>MULAI MEMBACA {queue.length} LJK</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Algorithm & Camera Status Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Scan className="w-4 h-4 text-blue-600" />
              <span>Spesifikasi Algoritma OMR</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Pemrosesan Computer Vision Asli Berbasis Pixel</p>

            <div className="mt-3.5 space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">1</span>
                <div>
                  <p className="font-semibold text-slate-800">Deteksi 4 Registration Marks</p>
                  <p className="text-[11px] text-slate-500">Mendeteksi 4 sudut penanda fiducial solid 7x7mm.</p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">2</span>
                <div>
                  <p className="font-semibold text-slate-800">Perspective Warp Normalization</p>
                  <p className="text-[11px] text-slate-500">Transformasi homografi untuk meluruskan kemiringan.</p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">3</span>
                <div>
                  <p className="font-semibold text-slate-800">Sampling Lingkaran Bagian Dalam</p>
                  <p className="text-[11px] text-slate-500">Sampling 68% radius dalam untuk abaikan tepi bubble.</p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">4</span>
                <div>
                  <p className="font-semibold text-slate-800">Analisis Rasio Relatif</p>
                  <p className="text-[11px] text-slate-500">Mencegah salah baca bekas hapusan / noda kertas.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3.5 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-medium">
            ✓ 100% Client-Side. Tidak ada foto siswa yang dikirim ke server luar.
          </div>
        </div>
      </div>

      {/* Live Camera Viewfinder Modal (Optimized for Android & Desktop) */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col justify-between overflow-hidden select-none animate-fadeIn">
          {/* Top Bar */}
          <div className="bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4 flex items-center justify-between text-white z-20">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="font-bold text-xs sm:text-sm">Scan Kamera LJK</span>
              {batchMode && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-300 border border-blue-400/40">
                  Mode Beruntun ({queue.length} LJK)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Torch button (if supported on hardware) */}
              {torchSupported && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`p-2.5 rounded-full transition ${
                    isTorchOn
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/40'
                      : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
                  title={isTorchOn ? 'Matikan Lampu Kilat' : 'Nyalakan Lampu Kilat (Senter)'}
                  aria-label="Lampu Senter"
                >
                  {isTorchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
                </button>
              )}

              {/* Switch Camera button */}
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
                title="Ganti Kamera Depan/Belakang"
                aria-label="Ganti Kamera"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={stopCameraStream}
                className="p-2.5 rounded-full bg-white/20 hover:bg-rose-600 text-white transition"
                title="Tutup Kamera"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Center Viewfinder with Optical Alignment Overlay */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover sm:object-contain"
            />

            {/* Notification Toast in Viewfinder (for Batch Mode) */}
            {batchToast && (
              <div className="absolute top-4 inset-x-4 max-w-sm mx-auto z-30 bg-emerald-600/90 backdrop-blur-xs text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xl flex items-center justify-center gap-2 animate-bounce">
                <Check className="w-4 h-4" />
                <span>{batchToast}</span>
              </div>
            )}

            {/* Document Alignment Frame (A4 Aspect Ratio: 1 : 1.414) */}
            <div className="absolute inset-4 sm:inset-8 flex items-center justify-center pointer-events-none">
              <div
                className="relative w-full max-w-[420px] aspect-[1/1.414] max-h-[82vh] rounded-xl border border-sky-400/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex flex-col justify-between p-3"
              >
                {/* 4 Corner Registration Mark Reticles */}
                {/* Top-Left */}
                <div className="absolute -top-1 -left-1 flex flex-col items-start">
                  <div className="w-7 h-7 border-t-4 border-l-4 border-sky-400 rounded-tl-sm"></div>
                  <span className="text-[9px] font-mono font-bold text-sky-300 bg-black/70 px-1 py-0.5 rounded mt-0.5">TL</span>
                </div>

                {/* Top-Right */}
                <div className="absolute -top-1 -right-1 flex flex-col items-end">
                  <div className="w-7 h-7 border-t-4 border-r-4 border-sky-400 rounded-tr-sm"></div>
                  <span className="text-[9px] font-mono font-bold text-sky-300 bg-black/70 px-1 py-0.5 rounded mt-0.5">TR</span>
                </div>

                {/* Center Alignment Crosshair & Instruction */}
                <div className="my-auto text-center px-4">
                  <div className="w-8 h-8 mx-auto mb-2 border border-sky-400/30 rounded-full flex items-center justify-center text-sky-400/50">
                    +
                  </div>
                  <p className="text-white text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-lg inline-block shadow-md">
                    Posisikan HP tegak lurus di atas LJK
                  </p>
                  <p className="text-[10px] text-sky-200/90 mt-1 drop-shadow">
                    Pastikan 4 kotak penanda sudut hitam masuk ke dalam bingkai
                  </p>
                </div>

                {/* Bottom Registration Mark Cutoff Line */}
                <div className="w-full border-t border-dashed border-sky-400/40 relative mb-4">
                  <span className="absolute -top-4 right-1 text-[9px] text-sky-300 bg-black/60 px-1 rounded font-mono">
                    Batas Sudut Bawah
                  </span>
                </div>

                {/* Bottom-Left */}
                <div className="absolute -bottom-1 -left-1 flex flex-col items-start">
                  <span className="text-[9px] font-mono font-bold text-sky-300 bg-black/70 px-1 py-0.5 rounded mb-0.5">BL</span>
                  <div className="w-7 h-7 border-b-4 border-l-4 border-sky-400 rounded-bl-sm"></div>
                </div>

                {/* Bottom-Right */}
                <div className="absolute -bottom-1 -right-1 flex flex-col items-end">
                  <span className="text-[9px] font-mono font-bold text-sky-300 bg-black/70 px-1 py-0.5 rounded mb-0.5">BR</span>
                  <div className="w-7 h-7 border-b-4 border-r-4 border-sky-400 rounded-br-sm"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Controls Bar */}
          <div className="bg-gradient-to-t from-black via-black/80 to-transparent p-4 sm:p-6 flex flex-col items-center gap-3 z-20">
            {/* Mode selection toggle */}
            <div className="flex items-center gap-4 text-xs text-white">
              <label className="flex items-center gap-2 cursor-pointer bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition">
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={e => setBatchMode(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0 w-4 h-4 accent-blue-500"
                />
                <span className="font-semibold">Mode Beruntun (Scan Banyak Lembar)</span>
              </label>
            </div>

            {/* Shutter Button & Finish button */}
            <div className="flex items-center justify-between w-full max-w-md px-4">
              <button
                type="button"
                onClick={stopCameraStream}
                className="text-xs text-slate-300 hover:text-white px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
              >
                Tutup
              </button>

              {/* Big Touch-Friendly Circular Shutter Button */}
              <button
                type="button"
                onClick={handleCaptureCamera}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white flex items-center justify-center p-1 bg-white/20 hover:bg-white/30 active:scale-95 transition-transform shadow-2xl"
                aria-label="Ambil Foto LJK"
              >
                <div className="w-full h-full rounded-full bg-white hover:bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                  <Camera className="w-8 h-8" />
                </div>
              </button>

              {queue.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    handleStartProcessing();
                  }}
                  className="text-xs font-bold text-white px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 shadow-md transition flex items-center gap-1.5"
                >
                  <span>Koreksi ({queue.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="w-16"></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Queue Preview List */}
      {queue.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Antrean Lembar Siap Dibaca ({queue.length})</h3>
              <p className="text-xs text-slate-500">Klik "Mulai Membaca LJK" untuk memproses seluruh antrean.</p>
            </div>
            <button
              onClick={() => setQueue([])}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Kosongkan Antrean</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {queue.map((item, idx) => (
              <div key={item.id} className="p-2 rounded-lg border border-slate-200 bg-slate-50 group relative">
                <div className="aspect-[3/4] bg-white rounded border border-slate-200 overflow-hidden mb-1.5 flex items-center justify-center">
                  <img src={item.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <p className="text-[11px] font-semibold text-slate-700 truncate" title={item.name}>
                  {item.name}
                </p>
                <button
                  type="button"
                  onClick={() => setQueue(q => q.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1.5 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition shadow-sm"
                  title="Hapus dari antrean"
                  aria-label="Hapus dari antrean"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Scans Table */}
      {recentScans.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Hasil Pembacaan Terkini ({recentScans.length} Lembar)</h3>
              <p className="text-xs text-slate-500">Hasil OMR dan skor sementara</p>
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-left text-xs whitespace-nowrap min-w-[620px]">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">Nomor Peserta</th>
                  <th className="py-2.5 px-3">Nama Siswa</th>
                  <th className="py-2.5 px-3">Kelas</th>
                  <th className="py-2.5 px-3 text-center">Skor / Max</th>
                  <th className="py-2.5 px-3 text-center">Nilai Akhir</th>
                  <th className="py-2.5 px-3">Status OMR</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentScans.map((scan, sIdx) => {
                  const student = participants.find(
                    p => p.nomorPeserta === scan.studentNumberDetected || p.id === scan.participantId
                  );
                  return (
                    <tr key={scan.scanId} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-500">{sIdx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {scan.studentNumberDetected || student?.nomorPeserta || '(Tidak terbaca)'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {scan.participantName || student?.nama || 'Peserta Belum Terdaftar'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {scan.participantClass || student?.kelas || 'IX'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {scan.totalScore} / {scan.maxScore}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-black ${
                          scan.finalGrade >= settings.kktp ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {scan.finalGrade}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {scan.needsVerification ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 flex items-center gap-1 w-max">
                            <AlertTriangle className="w-3 h-3" />
                            Perlu Verifikasi
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-max">
                            <CheckCircle2 className="w-3 h-3" />
                            Sah ({scan.calibrationConfidence}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onNavigateToVerification(scan.scanId)}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold transition text-xs"
                        >
                          Verifikasi Detail →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
