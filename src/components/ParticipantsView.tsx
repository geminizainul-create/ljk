/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Upload,
  Download,
  Search,
  Filter,
  Trash2,
  Edit2,
  Check,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { Participant } from '../types/ljk';
import {
  saveParticipant,
  saveParticipantsBatch,
  deleteParticipant
} from '../services/storage';
import {
  parseParticipantsFile,
  downloadSampleParticipantExcel
} from '../services/excelService';
import * as XLSX from 'xlsx';

interface ParticipantsViewProps {
  participants: Participant[];
  onParticipantAdded: (p: Participant) => void;
  onParticipantsImported: (batch: Participant[]) => void;
  onParticipantDeleted: (id: string) => void;
}

export const ParticipantsView: React.FC<ParticipantsViewProps> = ({
  participants,
  onParticipantAdded,
  onParticipantsImported,
  onParticipantDeleted
}) => {
  const [search, setSearch] = useState<string>('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editStudent, setEditStudent] = useState<Participant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nomorPeserta: '',
    nama: '',
    kelas: 'IX-A',
    nis: '',
    nisn: ''
  });

  // Unique classes
  const classes = useMemo(() => {
    const set = new Set(participants.map(p => p.kelas).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [participants]);

  // Filtered list
  const filtered = useMemo(() => {
    return participants.filter(p => {
      const matchClass = filterClass === 'all' || p.kelas === filterClass;
      const q = search.toLowerCase();
      const matchSearch =
        p.nama.toLowerCase().includes(q) ||
        p.nomorPeserta.toLowerCase().includes(q) ||
        (p.nis && p.nis.toLowerCase().includes(q));
      return matchClass && matchSearch;
    });
  }, [participants, filterClass, search]);

  const handleOpenAdd = () => {
    setEditStudent(null);
    setFormData({ nomorPeserta: '', nama: '', kelas: 'IX-A', nis: '', nisn: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Participant) => {
    setEditStudent(p);
    setFormData({
      nomorPeserta: p.nomorPeserta,
      nama: p.nama,
      kelas: p.kelas,
      nis: p.nis || '',
      nisn: p.nisn || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nomorPeserta.trim() || !formData.nama.trim()) {
      alert('Nomor Peserta dan Nama Lengkap wajib diisi');
      return;
    }

    const p: Participant = {
      id: editStudent ? editStudent.id : `p-${Date.now().toString(36)}`,
      nomorPeserta: formData.nomorPeserta.trim(),
      nama: formData.nama.trim().toUpperCase(),
      kelas: formData.kelas.trim(),
      nis: formData.nis.trim() || undefined,
      nisn: formData.nisn.trim() || undefined
    };

    await saveParticipant(p);
    onParticipantAdded(p);
    setIsModalOpen(false);
    setNotification({ type: 'success', message: `Data peserta "${p.nama}" berhasil disimpan.` });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteParticipant(deleteTarget.id);
      onParticipantDeleted(deleteTarget.id);
      setNotification({ type: 'success', message: `Data peserta "${deleteTarget.name}" berhasil dihapus.` });
      setDeleteTarget(null);
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal menghapus data peserta' });
    }
  };

  // Import from Excel file
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const imported = await parseParticipantsFile(files[0]);
      await saveParticipantsBatch(imported);
      onParticipantsImported(imported);
      setNotification({
        type: 'success',
        message: `Berhasil mengimpor ${imported.length} peserta didik dari file Excel.`
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal mengimpor file Excel' });
    }
  };

  // Export current participants to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['No', 'Nomor Peserta', 'Nama Lengkap', 'Kelas', 'NIS', 'NISN'],
      ...filtered.map((p, i) => [i + 1, p.nomorPeserta, p.nama, p.kelas, p.nis || '-', p.nisn || '-'])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Peserta');
    XLSX.writeFile(wb, `Data_Peserta_SMEPASDA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

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
          <h2 className="text-base font-extrabold text-slate-800">Master Data Peserta Ujian</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {participants.length} peserta terdaftar • Dicocokkan otomatis saat OMR membaca Nomor Peserta
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={downloadSampleParticipantExcel}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
            title="Download contoh template format kolom Excel"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Format Excel</span>
          </button>

          <label className="px-3.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-2xs">
            <Upload className="w-3.5 h-3.5 text-emerald-600" />
            <span>Import Excel</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
            <span>Ekspor Excel</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Peserta</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, nomor peserta, atau NIS..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-600">Filter Kelas:</span>
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium bg-white"
          >
            {classes.map(c => (
              <option key={c} value={c}>
                {c === 'all' ? 'Semua Kelas' : `Kelas ${c}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 w-12 text-center">No</th>
                <th className="py-2.5 px-4">Nomor Peserta</th>
                <th className="py-2.5 px-4">Nama Lengkap Siswa</th>
                <th className="py-2.5 px-4">Kelas</th>
                <th className="py-2.5 px-4">NIS</th>
                <th className="py-2.5 px-4">NISN</th>
                <th className="py-2.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Tidak ada peserta yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filtered.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-700">{p.nomorPeserta}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{p.nama}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {p.kelas}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{p.nis || '-'}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{p.nisn || '-'}</td>
                    <td className="py-2.5 px-4 text-right space-x-1">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition"
                        title="Edit Data"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: p.id, name: p.nama })}
                        className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-slate-100 transition"
                        title="Hapus Data"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-slate-800 pb-2 border-b border-slate-100">
              {editStudent ? 'Edit Data Peserta Ujian' : 'Tambah Peserta Ujian Baru'}
            </h3>

            <form onSubmit={handleSaveStudent} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Peserta (Wajib)
                </label>
                <input
                  type="text"
                  required
                  value={formData.nomorPeserta}
                  onChange={e => setFormData({ ...formData, nomorPeserta: e.target.value })}
                  placeholder="Contoh: 09-001 atau 10245"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Lengkap Siswa (Wajib)
                </label>
                <input
                  type="text"
                  required
                  value={formData.nama}
                  onChange={e => setFormData({ ...formData, nama: e.target.value })}
                  placeholder="Contoh: ACHMAD FADILLAH"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 uppercase focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kelas</label>
                  <input
                    type="text"
                    value={formData.kelas}
                    onChange={e => setFormData({ ...formData, kelas: e.target.value })}
                    placeholder="IX-A"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">NIS (Opsional)</label>
                  <input
                    type="text"
                    value={formData.nis}
                    onChange={e => setFormData({ ...formData, nis: e.target.value })}
                    placeholder="8401"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">NISN (Opsional)</label>
                <input
                  type="text"
                  value={formData.nisn}
                  onChange={e => setFormData({ ...formData, nisn: e.target.value })}
                  placeholder="0098401123"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
                >
                  Simpan Peserta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-base text-slate-800">Hapus Data Peserta?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Apakah Anda yakin ingin menghapus data peserta <span className="font-semibold text-slate-700">"{deleteTarget.name}"</span>?
              </p>
            </div>

            <div className="pt-2 flex justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
