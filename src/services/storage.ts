/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OMRTemplate,
  AnswerKey,
  Participant,
  ScanResult,
  SchoolSettings
} from '../types/ljk';

const DB_NAME = 'LJK_SMEPASDA_DB';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS: SchoolSettings = {
  namaSekolah: 'SMP Negeri 2 Pasirian',
  pemerintah: 'Pemerintah Kabupaten Lumajang',
  dinas: 'Dinas Pendidikan dan Kebudayaan',
  alamat: 'Jalan Gunung Tambuh No. 01 Pasirian',
  kabupaten: 'Kabupaten Lumajang',
  provinsi: 'Jawa Timur',
  npsn: '20521438',
  kktp: 75,
  omrThreshold: 0.40
};

// Open IndexedDB database
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'templateId' });
      }
      if (!db.objectStoreNames.contains('answerKeys')) {
        db.createObjectStore('answerKeys', { keyPath: 'keyId' });
      }
      if (!db.objectStoreNames.contains('participants')) {
        db.createObjectStore('participants', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('scanResults')) {
        db.createObjectStore('scanResults', { keyPath: 'scanId' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Generic IndexedDB operations
async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB read error on ${storeName}, falling back to localStorage`, err);
    const local = localStorage.getItem(`ljk_${storeName}`);
    return local ? JSON.parse(local) : [];
  }
}

async function putToStore<T>(storeName: string, item: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB put error on ${storeName}`, err);
    // fallback
    const items = await getAllFromStore<any>(storeName);
    const keyProp = storeName === 'templates' ? 'templateId' : storeName === 'answerKeys' ? 'keyId' : storeName === 'scanResults' ? 'scanId' : 'id';
    const idx = items.findIndex((i: any) => i[keyProp] === (item as any)[keyProp]);
    if (idx >= 0) items[idx] = item;
    else items.push(item);
    localStorage.setItem(`ljk_${storeName}`, JSON.stringify(items));
  }
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB delete error on ${storeName}`, err);
    const items = await getAllFromStore<any>(storeName);
    const keyProp = storeName === 'templates' ? 'templateId' : storeName === 'answerKeys' ? 'keyId' : storeName === 'scanResults' ? 'scanId' : 'id';
    const filtered = items.filter((i: any) => i[keyProp] !== key);
    localStorage.setItem(`ljk_${storeName}`, JSON.stringify(filtered));
  }
}

// Settings
export async function getSchoolSettings(): Promise<SchoolSettings> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get('current_settings');
      request.onsuccess = () => {
        resolve(request.result?.data || DEFAULT_SETTINGS);
      };
      request.onerror = () => resolve(DEFAULT_SETTINGS);
    });
  } catch {
    const local = localStorage.getItem('ljk_school_settings');
    return local ? JSON.parse(local) : DEFAULT_SETTINGS;
  }
}

export async function saveSchoolSettings(settings: SchoolSettings): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put({ id: 'current_settings', data: settings });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    localStorage.setItem('ljk_school_settings', JSON.stringify(settings));
  }
}

// Templates
export async function getAllTemplates(): Promise<OMRTemplate[]> {
  return getAllFromStore<OMRTemplate>('templates');
}

export async function getTemplateById(templateId: string): Promise<OMRTemplate | null> {
  const templates = await getAllTemplates();
  return templates.find(t => t.templateId === templateId) || null;
}

export async function saveTemplate(template: OMRTemplate): Promise<void> {
  return putToStore('templates', template);
}

export async function deleteTemplate(templateId: string): Promise<void> {
  return deleteFromStore('templates', templateId);
}

// Answer Keys
export async function getAllAnswerKeys(): Promise<AnswerKey[]> {
  return getAllFromStore<AnswerKey>('answerKeys');
}

export async function getAnswerKeyById(keyId: string): Promise<AnswerKey | null> {
  const keys = await getAllAnswerKeys();
  return keys.find(k => k.keyId === keyId) || null;
}

export async function getAnswerKeyByTemplateId(templateId: string): Promise<AnswerKey | null> {
  const keys = await getAllAnswerKeys();
  return keys.find(k => k.templateId === templateId) || null;
}

export async function saveAnswerKey(key: AnswerKey): Promise<void> {
  return putToStore('answerKeys', key);
}

export async function deleteAnswerKey(keyId: string): Promise<void> {
  return deleteFromStore('answerKeys', keyId);
}

// Participants
export async function getAllParticipants(): Promise<Participant[]> {
  return getAllFromStore<Participant>('participants');
}

export async function saveParticipant(p: Participant): Promise<void> {
  return putToStore('participants', p);
}

export async function saveParticipantsBatch(batch: Participant[]): Promise<void> {
  for (const p of batch) {
    await saveParticipant(p);
  }
}

export async function deleteParticipant(id: string): Promise<void> {
  return deleteFromStore('participants', id);
}

export async function findParticipantByNumber(nomorPeserta: string): Promise<Participant | null> {
  const participants = await getAllParticipants();
  const normalized = nomorPeserta.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return participants.find(p => {
    const pNorm = p.nomorPeserta.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return pNorm === normalized || p.nomorPeserta === nomorPeserta;
  }) || null;
}

// Scan Results
export async function getAllScanResults(): Promise<ScanResult[]> {
  return getAllFromStore<ScanResult>('scanResults');
}

export async function getScanResultById(scanId: string): Promise<ScanResult | null> {
  const results = await getAllScanResults();
  return results.find(r => r.scanId === scanId) || null;
}

export async function saveScanResult(scan: ScanResult): Promise<void> {
  return putToStore('scanResults', scan);
}

export async function deleteScanResult(scanId: string): Promise<void> {
  return deleteFromStore('scanResults', scanId);
}

export async function clearAllScanResults(): Promise<void> {
  const scans = await getAllScanResults();
  for (const s of scans) {
    await deleteScanResult(s.scanId);
  }
}

// Seed initial default data for SMP Negeri 2 Pasirian PSAJ IX if empty
export async function seedInitialDataIfNeeded(defaultTemplate: OMRTemplate, defaultKey: AnswerKey) {
  try {
    const templates = await getAllTemplates();
    if (templates.length === 0) {
      await saveTemplate(defaultTemplate);
    }

    const keys = await getAllAnswerKeys();
    if (keys.length === 0) {
      await saveAnswerKey(defaultKey);
    }

    const participants = await getAllParticipants();
    if (participants.length === 0) {
      // Seed class 9A, 9B, 9C students
      const initialStudents: Participant[] = [
        { id: 'p-1', nomorPeserta: '09-001', nama: 'ACHMAD FADILLAH', kelas: 'IX-A', nis: '8401', nisn: '0098401123' },
        { id: 'p-2', nomorPeserta: '09-002', nama: 'ADINDA PUTRI LESTARI', kelas: 'IX-A', nis: '8402', nisn: '0098402456' },
        { id: 'p-3', nomorPeserta: '09-003', nama: 'BAGAS ARYA PRASETYA', kelas: 'IX-A', nis: '8403', nisn: '0098403789' },
        { id: 'p-4', nomorPeserta: '09-004', nama: 'CHELSEA OLIVIA MAHARANI', kelas: 'IX-A', nis: '8404', nisn: '0098404012' },
        { id: 'p-5', nomorPeserta: '09-005', nama: 'DIMAS SAPUTRA', kelas: 'IX-A', nis: '8405', nisn: '0098405345' },
        { id: 'p-6', nomorPeserta: '09-006', nama: 'EKA NUR AINI', kelas: 'IX-A', nis: '8406', nisn: '0098406678' },
        { id: 'p-7', nomorPeserta: '09-007', nama: 'FAIZAL HIDAYAT', kelas: 'IX-A', nis: '8407', nisn: '0098407901' },
        { id: 'p-8', nomorPeserta: '09-008', nama: 'GITA KARTIKA DEWI', kelas: 'IX-A', nis: '8408', nisn: '0098408234' },
        { id: 'p-9', nomorPeserta: '09-009', nama: 'ILHAM MAULANA', kelas: 'IX-B', nis: '8409', nisn: '0098409567' },
        { id: 'p-10', nomorPeserta: '09-010', nama: 'JESSICA AMALIA', kelas: 'IX-B', nis: '8410', nisn: '0098410890' },
        { id: 'p-11', nomorPeserta: '09-011', nama: 'KEVIN RADITYA', kelas: 'IX-B', nis: '8411', nisn: '0098411123' },
        { id: 'p-12', nomorPeserta: '09-012', nama: 'LUTFI NAFISAH', kelas: 'IX-B', nis: '8412', nisn: '0098412456' },
        { id: 'p-13', nomorPeserta: '09-013', nama: 'MUHAMMAD RIZKY', kelas: 'IX-C', nis: '8413', nisn: '0098413789' },
        { id: 'p-14', nomorPeserta: '09-014', nama: 'NADIA RAHMAWATI', kelas: 'IX-C', nis: '8414', nisn: '0098414012' },
        { id: 'p-15', nomorPeserta: '09-015', nama: 'RAFAEL KURNIAWAN', kelas: 'IX-C', nis: '8415', nisn: '0098415345' },
      ];
      await saveParticipantsBatch(initialStudents);
    }
  } catch (err) {
    console.error('Failed to seed initial data:', err);
  }
}

// Backup & Restore
export async function exportDatabaseBackup(): Promise<string> {
  const settings = await getSchoolSettings();
  const templates = await getAllTemplates();
  const answerKeys = await getAllAnswerKeys();
  const participants = await getAllParticipants();
  const scanResults = await getAllScanResults();

  const backup = {
    appName: 'LJK GENERATOR SMEPASDA',
    exportDate: new Date().toISOString(),
    version: 1,
    settings,
    templates,
    answerKeys,
    participants,
    scanResults
  };

  return JSON.stringify(backup, null, 2);
}

export async function importDatabaseBackup(jsonString: string): Promise<{ success: boolean; message: string }> {
  try {
    const data = JSON.parse(jsonString);
    if (!data.appName || !data.version) {
      return { success: false, message: 'File backup tidak valid untuk LJK SMEPASDA' };
    }

    if (data.settings) await saveSchoolSettings(data.settings);
    if (data.templates) {
      for (const t of data.templates) await saveTemplate(t);
    }
    if (data.answerKeys) {
      for (const k of data.answerKeys) await saveAnswerKey(k);
    }
    if (data.participants) {
      for (const p of data.participants) await saveParticipant(p);
    }
    if (data.scanResults) {
      for (const s of data.scanResults) await saveScanResult(s);
    }

    return { success: true, message: 'Data backup berhasil dipulihkan' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal memproses file JSON backup' };
  }
}
