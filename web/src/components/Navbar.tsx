import React from 'react';
import {
  Sparkles,
  Layers,
  Search,
  TrendingUp,
  HelpCircle,
  Database,
  Cpu,
  User,
  ToggleLeft,
  ToggleRight,
  Play,
} from 'lucide-react';
import type { HealthResponse } from '../types';

export type NavTab = 'brief' | 'leaks' | 'forecast' | 'explainer';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isMockMode: boolean;
  onToggleMockMode: (val: boolean) => void;
  health: HealthResponse | null;
  onTriggerRun: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  isMockMode,
  onToggleMockMode,
  health,
  onTriggerRun,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-glow-emerald">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Layers className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-white text-base tracking-tight">Ledger Lens</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                    AGENT v1.0
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">Autonomous AI Finance Team</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => onSelectTab('brief')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  activeTab === 'brief'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Morning Brief
              </button>

              <button
                onClick={() => onSelectTab('leaks')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  activeTab === 'leaks'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-rose-400" />
                Audited Leaks
              </button>

              <button
                onClick={() => onSelectTab('forecast')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  activeTab === 'forecast'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                Cash & What-Ifs
              </button>

              <button
                onClick={() => onSelectTab('explainer')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  activeTab === 'explainer'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
                Why Margin Dropped?
              </button>
            </nav>
          </div>

          {/* Right Tools & Status */}
          <div className="flex items-center gap-3">
            {/* System Engine Indicators */}
            <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono">
              {/* Zetaris Status */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300"
                title="Zetaris Semantic Data Layer (Port 8888)"
              >
                <Database className="w-3 h-3 text-cyan-400" />
                <span>Zetaris:</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isMockMode || health?.zetaris ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  }`}
                />
              </div>

              {/* Nightshift Status */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300"
                title="Meterless Nightshift → NVIDIA Nemotron (Port 8088)"
              >
                <Cpu className="w-3 h-3 text-violet-400" />
                <span>Nemotron:</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isMockMode || health?.nightshift ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  }`}
                />
              </div>
            </div>

            {/* Mock Mode Switcher */}
            <button
              onClick={() => onToggleMockMode(!isMockMode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                isMockMode
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              }`}
              title="Toggle between deterministic local mock dataset and live Fastify backend (Port 4000)"
            >
              {isMockMode ? (
                <>
                  <ToggleLeft className="w-4 h-4 text-amber-400" />
                  <span>DEMO MOCK</span>
                </>
              ) : (
                <>
                  <ToggleRight className="w-4 h-4 text-emerald-400" />
                  <span>LIVE API (:4000)</span>
                </>
              )}
            </button>

            {/* Run Analysis Trigger */}
            <button
              onClick={onTriggerRun}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold text-xs shadow-glow-emerald transition-all duration-200 flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Run AI Team</span>
            </button>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <User className="w-4 h-4" />
              </div>
              <div className="hidden xl:block text-left">
                <div className="text-xs font-semibold text-white leading-tight">Sara Vance</div>
                <div className="text-[10px] text-slate-400 font-mono">Solo Design Studio</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
