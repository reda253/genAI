import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  Search,
  TrendingUp,
  HelpCircle,
  Database,
  Cpu,
  Play,
  ChevronDown,
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
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-glow-emerald">
              <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center">
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base tracking-tight">Ledger Lens</span>
              <span className="hidden sm:inline-flex text-[10px] font-mono px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-semibold">
                AI CFO
              </span>
            </div>
          </div>

          {/* Center: Segmented Navigation Pill */}
          <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800/90 shadow-inner">
            <button
              onClick={() => onSelectTab('brief')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'brief'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Brief</span>
            </button>

            <button
              onClick={() => onSelectTab('leaks')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'leaks'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-rose-400" />
              <span>Leaks</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-300 font-bold">
                6
              </span>
            </button>

            <button
              onClick={() => onSelectTab('forecast')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'forecast'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>Forecast</span>
            </button>

            <button
              onClick={() => onSelectTab('explainer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'explainer'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
              <span>Why?</span>
            </button>
          </nav>

          {/* Right: Telemetry, Demo Toggle, Action & Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            
            {/* System Status Pill (Compact) */}
            <div
              className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400"
              title="System Health: Zetaris Semantic Layer + NVIDIA Nemotron Nightshift"
            >
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3 text-cyan-400" />
                <span className="text-slate-300">Zetaris</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isMockMode || health?.zetaris ? 'bg-emerald-400' : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-violet-400" />
                <span className="text-slate-300">Nemotron</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isMockMode || health?.nightshift ? 'bg-emerald-400' : 'bg-rose-500'
                  }`}
                />
              </span>
            </div>

            {/* Mock / Live Toggle */}
            <button
              onClick={() => onToggleMockMode(!isMockMode)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                isMockMode
                  ? 'bg-amber-950/30 border-amber-500/30 text-amber-300 hover:bg-amber-900/40'
                  : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40'
              }`}
              title="Toggle data source: Local verified mock data vs live Fastify server on :4000"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isMockMode ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span className="text-[11px]">{isMockMode ? 'MOCK DATA' : 'LIVE API'}</span>
            </button>

            {/* Run Analysis Action */}
            <button
              onClick={onTriggerRun}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-glow-emerald transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Play className="w-3 h-3 fill-white" />
              <span className="hidden sm:inline">Run Audit</span>
            </button>

            {/* Sara Vance Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
                aria-label="User profile"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 border border-slate-500/40 flex items-center justify-center text-xs font-bold text-white font-mono">
                  SV
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block" />
              </button>

              {/* Profile Popover */}
              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 z-50 animate-fade-in text-xs">
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                      <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-emerald-400 font-mono">
                        SV
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">Sara Vance</div>
                        <div className="text-slate-400 text-[11px]">Sara Vance Studio LLC</div>
                      </div>
                    </div>

                    <div className="pt-3 space-y-2 text-slate-300 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Persona Profile:</span>
                        <span className="font-mono text-white">Freelance Designer</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Active Clients:</span>
                        <span className="font-mono text-emerald-400">9 accounts</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Base Currency:</span>
                        <span className="font-mono text-white">EUR (€) / MAD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Architecture:</span>
                        <span className="font-mono text-cyan-300">Zetaris + Meterless</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};
