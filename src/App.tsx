/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar, NavItem } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { LjkGeneratorView } from './components/LjkGeneratorView';
import { TemplatesManagerView } from './components/TemplatesManagerView';
import { OmrScannerView } from './components/OmrScannerView';
import { ManualVerificationView } from './components/ManualVerificationView';
import { AnswerKeyView } from './components/AnswerKeyView';
import { ParticipantsView } from './components/ParticipantsView';
import { GradeRecapView } from './components/GradeRecapView';
import { ItemAnalysisView } from './components/ItemAnalysisView';
import { SchoolSettingsView } from './components/SchoolSettingsView';

import {
  OMRTemplate,
  AnswerKey,
  Participant,
  ScanResult,
  SchoolSettings
} from './types/ljk';
import {
  getSchoolSettings,
  getAllTemplates,
  getAllAnswerKeys,
  getAllParticipants,
  getAllScanResults,
  seedInitialDataIfNeeded,
  DEFAULT_SETTINGS
} from './services/storage';
import { createDefaultTemplate, createDefaultAnswerKey } from './services/defaultData';
import { School } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavItem>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // App Data State
  const [settings, setSettings] = useState<SchoolSettings>(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState<OMRTemplate[]>([]);
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [selectedScanIdForVerif, setSelectedScanIdForVerif] = useState<string | undefined>(undefined);
  const [templateToEdit, setTemplateToEdit] = useState<OMRTemplate | null>(null);

  // Load and seed initial data
  const loadAllData = async () => {
    try {
      const defTemplate = createDefaultTemplate();
      const defKey = createDefaultAnswerKey(defTemplate.templateId);
      await seedInitialDataIfNeeded(defTemplate, defKey);

      const [loadedSettings, loadedTemplates, loadedKeys, loadedParticipants, loadedScans] = await Promise.all([
        getSchoolSettings(),
        getAllTemplates(),
        getAllAnswerKeys(),
        getAllParticipants(),
        getAllScanResults()
      ]);

      setSettings(loadedSettings);
      setTemplates(loadedTemplates);
      setAnswerKeys(loadedKeys);
      setParticipants(loadedParticipants);
      setScans(loadedScans);
    } catch (err) {
      console.error('Data initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Handlers for state updates across views
  const handleTemplateSaved = (tpl: OMRTemplate) => {
    setTemplates(prev => {
      const idx = prev.findIndex(t => t.templateId === tpl.templateId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = tpl;
        return copy;
      }
      return [tpl, ...prev];
    });
    if (templateToEdit?.templateId === tpl.templateId) {
      setTemplateToEdit(tpl);
    }
  };

  const handleTemplateDeleted = (templateId: string) => {
    setTemplates(prev => prev.filter(t => t.templateId !== templateId));
    if (templateToEdit?.templateId === templateId) {
      setTemplateToEdit(null);
    }
  };

  const handleScanCompleted = (scan: ScanResult) => {
    setScans(prev => {
      const idx = prev.findIndex(s => s.scanId === scan.scanId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = scan;
        return copy;
      }
      return [scan, ...prev];
    });
  };

  const handleScanUpdated = (scan: ScanResult) => {
    setScans(prev => {
      const idx = prev.findIndex(s => s.scanId === scan.scanId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = scan;
        return copy;
      }
      return [scan, ...prev];
    });
  };

  const handleAnswerKeyUpdated = (key: AnswerKey) => {
    setAnswerKeys(prev => {
      const idx = prev.findIndex(k => k.keyId === key.keyId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = key;
        return copy;
      }
      return [key, ...prev];
    });
  };

  const handleParticipantAdded = (p: Participant) => {
    setParticipants(prev => {
      const idx = prev.findIndex(item => item.id === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = p;
        return copy;
      }
      return [p, ...prev];
    });
  };

  const handleParticipantsImported = (batch: Participant[]) => {
    setParticipants(prev => [...batch, ...prev]);
  };

  const handleParticipantDeleted = (id: string) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const handleNavigateToVerification = (scanId: string) => {
    setSelectedScanIdForVerif(scanId);
    setCurrentTab('verification');
  };

  const handleOpenQuickScan = () => {
    setCurrentTab('scanner');
  };

  const handleOpenTestSimulation = () => {
    setCurrentTab('scanner');
  };

  // Pending verification count for badge
  const pendingCount = scans.filter(s => s.needsVerification || s.verificationStatus === 'BELUM_DIVERIFIKASI').length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white shadow-xl shadow-blue-500/30 animate-bounce mb-4">
          <School className="w-8 h-8" />
        </div>
        <h2 className="font-extrabold text-lg tracking-wider">LJK GENERATOR SMEPASDA</h2>
        <p className="text-xs text-slate-400 mt-1">Memuat database evaluasi & model OMR terstandarisasi...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={tab => {
          setSelectedScanIdForVerif(undefined);
          setCurrentTab(tab);
        }}
        pendingVerificationCount={pendingCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          settings={settings}
          onOpenTestSimulation={handleOpenTestSimulation}
          onOpenQuickScan={handleOpenQuickScan}
        />

        {/* Scrollable View Container */}
        <main className="flex-1 overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              templates={templates}
              scans={scans}
              participants={participants}
              answerKeys={answerKeys}
              settings={settings}
              onNavigate={setCurrentTab}
              onSelectScanForVerification={handleNavigateToVerification}
              onOpenTestSimulation={handleOpenTestSimulation}
            />
          )}

          {currentTab === 'generator' && (
            <LjkGeneratorView
              settings={settings}
              onTemplateSaved={handleTemplateSaved}
              templateToEdit={templateToEdit}
              onClearTemplateToEdit={() => setTemplateToEdit(null)}
            />
          )}

          {currentTab === 'templates' && (
            <TemplatesManagerView
              templates={templates}
              onTemplateDeleted={handleTemplateDeleted}
              onSelectTemplateToEdit={tpl => {
                setTemplateToEdit(tpl);
                setCurrentTab('generator');
              }}
            />
          )}

          {currentTab === 'scanner' && (
            <OmrScannerView
              templates={templates}
              answerKeys={answerKeys}
              participants={participants}
              settings={settings}
              onScanCompleted={handleScanCompleted}
              onNavigateToVerification={handleNavigateToVerification}
            />
          )}

          {currentTab === 'verification' && (
            <ManualVerificationView
              scans={scans}
              templates={templates}
              answerKeys={answerKeys}
              participants={participants}
              settings={settings}
              selectedScanId={selectedScanIdForVerif}
              onScanUpdated={handleScanUpdated}
            />
          )}

          {currentTab === 'keys' && (
            <AnswerKeyView
              answerKeys={answerKeys}
              templates={templates}
              onAnswerKeyUpdated={handleAnswerKeyUpdated}
              onAnswerKeyDeleted={id => setAnswerKeys(k => k.filter(item => item.keyId !== id))}
            />
          )}

          {currentTab === 'participants' && (
            <ParticipantsView
              participants={participants}
              onParticipantAdded={handleParticipantAdded}
              onParticipantsImported={handleParticipantsImported}
              onParticipantDeleted={handleParticipantDeleted}
            />
          )}

          {currentTab === 'recap' && (
            <GradeRecapView
              scans={scans}
              participants={participants}
              settings={settings}
              templates={templates}
              onNavigateToVerification={handleNavigateToVerification}
            />
          )}

          {currentTab === 'analysis' && (
            <ItemAnalysisView
              scans={scans}
              answerKeys={answerKeys}
              templates={templates}
              settings={settings}
            />
          )}

          {currentTab === 'settings' && (
            <SchoolSettingsView
              settings={settings}
              onSettingsUpdated={setSettings}
              onDataReset={loadAllData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
