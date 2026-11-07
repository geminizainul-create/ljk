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
  Layers
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

  // Camera state
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Webcam capture start
  const handleStartCamera = async () => {
    try {
      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Tidak dapat mengakses kamera. Pastikan izin kamera aktif.');
      setIsCameraOpen(false);
    }
  };

  // Capture frame from webcam
  const handleCaptureCamera = () => {
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
    setIsCameraOpen(false);

    setQueue(prev => [
      ...prev,
      {
        id: `cam-${Date.now()}`,
        name: `Foto Kamera (${new Date().toLocaleTimeString('id-ID')})`,
        canvas,
        previewUrl: canvas.toDataURL('image/jpeg', 0.8)
      }
    ]);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Error notification */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="font-bold text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Control Bar: Select Template & Sensitivitas OMR */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-5">
          <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Template LJK Target</label>
          <select
            value={selectedTemplateId}
            onChange={e => setSelectedTemplateId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500/20"
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
            <span className="font-mono text-blue-600">{Math.round(threshold * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.20"
            max="0.70"
            step="0.05"
            value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Lebih Sensitif (Pensil Tipis)</span>
            <span>Standar 2B</span>
            <span>Ketat (Pensil Pekat)</span>
          </div>
        </div>

        <div className="md:col-span-3 flex justify-end">
          <button
            onClick={handleRunSimulation}
            disabled={isProcessing}
            className="w-full py-2 px-3.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-300 hover:bg-sky-100 text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs disabled:opacity-50"
            title="Generate lembar LJK sintetis dengan pensil realistis dan uji pembacaan"
          >
            <Sparkles className="w-4 h-4 text-sky-600" />
            <span>Uji Coba LJK Sintetis</span>
          </button>
        </div>
      </div>

      {/* Upload Zone & Action Buttons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload dropzone card */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleFilesSelected(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/30 flex flex-col items-center justify-center min-h-[220px]"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png, image/jpeg, image/jpg, application/pdf"
              onChange={e => handleFilesSelected(e.target.files)}
              className="hidden"
            />
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-inner">
              <Upload className="w-7 h-7" />
            </div>
            <p className="font-bold text-sm text-slate-800">
              Tarik & Lepaskan File Scan LJK ke Sini
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Mendukung file <span className="font-semibold text-slate-700">PDF Multi-Halaman, JPG, atau PNG</span>
            </p>
            <span className="mt-3 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs">
              Pilih File Scan dari Komputer
            </span>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={handleStartCamera}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-2 transition"
            >
              <Camera className="w-4 h-4 text-slate-600" />
              <span>Scan Menggunakan Kamera / Webcam</span>
            </button>

            {queue.length > 0 && (
              <button
                onClick={handleStartProcessing}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition disabled:opacity-50"
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
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Scan className="w-4 h-4 text-blue-600" />
              <span>Spesifikasi Algoritma OMR</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Pemrosesan Computer Vision Asli Berbasis Pixel</p>

            <div className="mt-4 space-y-2.5 text-xs">
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
                  <p className="text-[11px] text-slate-500">Transformasi matriks homografi 3x3 untuk meluruskan kemiringan.</p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">3</span>
                <div>
                  <p className="font-semibold text-slate-800">Sampling Lingkaran Bagian Dalam</p>
                  <p className="text-[11px] text-slate-500">Sampling 68% radius dalam untuk mengabaikan garis lingkaran.</p>
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

          <div className="mt-4 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-medium">
            ✓ 100% Client-Side. Tidak ada foto siswa yang dikirim ke server luar.
          </div>
        </div>
      </div>

      {/* Live Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Posisikan Lembar LJK di Depan Kamera</span>
              </h3>
              <button
                onClick={() => {
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach(t => t.stop());
                  setIsCameraOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="relative bg-black rounded-xl overflow-hidden aspect-[3/4] max-h-[460px] flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              {/* Overlay target box for alignment */}
              <div className="absolute inset-8 border-2 border-dashed border-sky-400 rounded-lg pointer-events-none flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-6 h-6 border-t-4 border-l-4 border-sky-400"></div>
                  <div className="w-6 h-6 border-t-4 border-r-4 border-sky-400"></div>
                </div>
                <div className="flex justify-between">
                  <div className="w-6 h-6 border-b-4 border-l-4 border-sky-400"></div>
                  <div className="w-6 h-6 border-b-4 border-r-4 border-sky-400"></div>
                </div>
              </div>
            </div>

            <p className="text-xs text-center text-slate-500">
              Pastikan ke-4 kotak sudut hitam terlihat jelas dan pencahayaan rata.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach(t => t.stop());
                  setIsCameraOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleCaptureCamera}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
              >
                Ambil Foto Lembar
              </button>
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
                  onClick={() => setQueue(q => q.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/70 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition"
                  title="Hapus dari antrean"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Scans Table */}
      {recentScans.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Hasil Pembacaan Terkini ({recentScans.length} Lembar)</h3>
              <p className="text-xs text-slate-500">Hasil OMR dan skor sementara</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
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
                          className="px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold transition text-xs"
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
