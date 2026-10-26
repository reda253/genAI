import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import type { Brief, Finding, Forecast, Explanation, HealthResponse, Scenario, Move } from './types';
import type { Currency } from './currency';
import { Navbar, type NavTab } from './components/Navbar';
import { ParticleBackground } from './components/ParticleBackground';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { EntityDrawer } from './components/EntityDrawer';
import { ActionDraftModal } from './components/ActionDraftModal';
import { RunModal } from './components/RunModal';
import { BriefPage } from './pages/BriefPage';
import { LeaksPage } from './pages/LeaksPage';
import { ForecastPage } from './pages/ForecastPage';
import { ExplainerPage } from './pages/ExplainerPage';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('brief');
  const [isMockMode, setIsMockMode] = useState<boolean>(api.getIsMockMode());
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Core Data States
  const [brief, setBrief] = useState<Brief | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal / Drawer States
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [isEntityDrawerOpen, setIsEntityDrawerOpen] = useState(false);
  const [draftingMove, setDraftingMove] = useState<Move | null>(null);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load all initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, bRes, fRes, fcRes, expRes] = await Promise.allSettled([
        api.getHealth(),
        api.getBrief(),
        api.getFindings(),
        api.getForecast(),
        api.explain('Why did my margin drop in September?'),
      ]);

      if (hRes.status === 'fulfilled') setHealth(hRes.value);
      if (bRes.status === 'fulfilled') setBrief(bRes.value);
      if (fRes.status === 'fulfilled') setFindings(fRes.value);
      if (fcRes.status === 'fulfilled') setForecast(fcRes.value);
      if (expRes.status === 'fulfilled') setExplanation(expRes.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = api.subscribeMockMode((val) => {
      setIsMockMode(val);
      loadData();
    });
    return unsub;
  }, [loadData]);

  // Handle Move Decision (Approve / Reject)
  const handleDecideMove = async (id: string, decision: 'approve' | 'reject') => {
    try {
      const updatedMove = await api.decide(id, decision);
      setBrief((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          moves: prev.moves.map((m) => (m.id === id ? updatedMove : m)),
        };
      });
      showToast(
        decision === 'approve'
          ? `✓ Move ${id} approved. Logged into Meterless H-MEM decision store.`
          : `✕ Move ${id} rejected. Future recommendations adjusted via H-MEM.`
      );
    } catch (err: any) {
      showToast(`Error recording decision: ${err.message}`);
    }
  };

  // Open evidence drawer for a finding
  const handleInspectFinding = (finding: Finding) => {
    setSelectedFinding(finding);
    setIsDrawerOpen(true);
  };

  // Open evidence drawer by ID
  const handleInspectFindingById = (findingId: string) => {
    const found = findings.find((f) => f.id === findingId);
    if (found) {
      setSelectedFinding(found);
      setIsDrawerOpen(true);
    } else {
      showToast(`Finding ${findingId} could not be located.`);
    }
  };

  // Open Entity 360 Drawer
  const handleOpenEntity = (entityId: string) => {
    setSelectedEntityId(entityId);
    setIsEntityDrawerOpen(true);
  };

  // Open Action Draft Modal
  const handleDraftMove = (move: Move) => {
    setDraftingMove(move);
    setIsDraftModalOpen(true);
  };

  // Run What-If Scenario
  const handleRunWhatIf = async (scenario: Scenario) => {
    return api.whatIf(scenario);
  };

  // Simulate loss of client from EntityDrawer
  const handleSimulateLoss = (clientId: string) => {
    setActiveTab('forecast');
    showToast(`Simulation configured: losing client ${clientId}`);
  };

  // Custom question for Explainer
  const handleAskExplainer = async (question: string) => {
    const res = await api.explain(question);
    setExplanation(res);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative">
      {/* 3D Ambient Network Backdrop */}
      <ParticleBackground />

      {/* Primary Header */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isMockMode={isMockMode}
        onToggleMockMode={(val) => api.setMockMode(val)}
        health={health}
        currency={currency}
        onToggleCurrency={setCurrency}
        onTriggerRun={() => setIsRunModalOpen(true)}
        findingsCount={brief?.findings_count ?? findings.length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8 z-10">
        {activeTab === 'brief' && (
          <BriefPage
            brief={brief}
            findings={findings}
            loading={loading}
            onDecideMove={handleDecideMove}
            onInspectFinding={handleInspectFindingById}
            onNavigateToLeaks={() => setActiveTab('leaks')}
            onTriggerRun={() => setIsRunModalOpen(true)}
            onDraftMove={handleDraftMove}
          />
        )}

        {activeTab === 'leaks' && (
          <LeaksPage
            findings={findings}
            loading={loading}
            onInspectFinding={handleInspectFinding}
            onOpenEntity={handleOpenEntity}
          />
        )}

        {activeTab === 'forecast' && (
          <ForecastPage
            baselineForecast={forecast}
            loading={loading}
            onRunWhatIf={handleRunWhatIf}
          />
        )}

        {activeTab === 'explainer' && (
          <ExplainerPage
            explanation={explanation}
            loading={loading}
            onAskQuestion={handleAskExplainer}
            onInspectFindingById={handleInspectFindingById}
            onInspectEvidenceDirect={handleInspectFinding}
          />
        )}
      </main>

      {/* Evidence Drawer */}
      <EvidenceDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOpenEntity={handleOpenEntity}
      />

      {/* Client 360 Entity Drawer (I3) */}
      <EntityDrawer
        entityId={selectedEntityId}
        isOpen={isEntityDrawerOpen}
        onClose={() => setIsEntityDrawerOpen(false)}
        onInspectFinding={handleInspectFindingById}
        onSimulateLoss={handleSimulateLoss}
      />

      {/* Action Draft Modal (I2) */}
      <ActionDraftModal
        move={draftingMove}
        isOpen={isDraftModalOpen}
        onClose={() => setIsDraftModalOpen(false)}
        onApproveMove={(moveId) => handleDecideMove(moveId, 'approve')}
      />

      {/* Autonomous Run Orchestrator Modal (I1 / M3) */}
      <RunModal
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        onRunComplete={() => {
          loadData();
          showToast('✓ AI Agent Run completed. All views and recommendations updated.');
        }}
      />

      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className="px-4 py-3 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-2xl text-xs font-mono text-emerald-300 flex items-center gap-2 backdrop-blur-md">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
