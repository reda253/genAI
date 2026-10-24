import React, { useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Calculator,
  UserX,
  Percent,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { Forecast, Scenario } from '../types';

interface ForecastPageProps {
  baselineForecast: Forecast | null;
  loading: boolean;
  onRunWhatIf: (scenario: Scenario) => Promise<{ baseline: Forecast; scenario: Forecast }>;
}

export const ForecastPage: React.FC<ForecastPageProps> = ({
  baselineForecast,
  loading,
  onRunWhatIf,
}) => {
  const [scenarioForecast, setScenarioForecast] = useState<Forecast | null>(null);
  const [activeScenarioType, setActiveScenarioType] = useState<'none' | 'lose_client' | 'raise_prices'>('none');
  const [selectedClient, setSelectedClient] = useState('c01');
  const [priceHikePct, setPriceHikePct] = useState(10);
  const [isSimulating, setIsSimulating] = useState(false);

  if (loading || !baselineForecast) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 rounded-3xl bg-slate-900/60 border border-slate-800" />
        <div className="h-96 rounded-2xl bg-slate-900/60 border border-slate-800" />
      </div>
    );
  }

  const handleLoseClient = async (clientId: string) => {
    setIsSimulating(true);
    setActiveScenarioType('lose_client');
    try {
      const res = await onRunWhatIf({ type: 'lose_client', client_id: clientId });
      setScenarioForecast(res.scenario);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRaisePrices = async (pct: number) => {
    setIsSimulating(true);
    setActiveScenarioType('raise_prices');
    try {
      const res = await onRunWhatIf({ type: 'raise_prices', pct });
      setScenarioForecast(res.scenario);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleReset = () => {
    setActiveScenarioType('none');
    setScenarioForecast(null);
  };

  // Merge monthly series for recharts
  const chartData = baselineForecast.months.map((baseMonth, idx) => {
    const scnMonth = scenarioForecast?.months[idx];
    const dateObj = new Date(baseMonth.month);
    const label = dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    return {
      month: label,
      baselineBalance: baseMonth.balance,
      scenarioBalance: scnMonth ? scnMonth.balance : null,
      baselineInflow: baseMonth.inflow,
      scenarioInflow: scnMonth ? scnMonth.inflow : null,
      outflow: baseMonth.outflow,
    };
  });

  const activeMinBalance = scenarioForecast ? scenarioForecast.min_balance : baselineForecast.min_balance;
  const balanceDelta = scenarioForecast
    ? scenarioForecast.months[scenarioForecast.months.length - 1].balance -
      baselineForecast.months[baselineForecast.months.length - 1].balance
    : 0;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-8 border border-slate-700/60 relative overflow-hidden shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge-emerald font-mono">
                <Calculator className="w-3 h-3" />
                6-MONTH CASH PROJECTION
              </span>
              <span className="text-xs text-slate-400 font-mono">Math Engine: forecast_math.ts</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
              Financial Runway & What-If Simulator
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Deterministic code projections, not LLM guesses. Simulate major business decisions like
              losing a key client or raising prices by 10%.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-6 bg-slate-925/90 p-5 rounded-2xl border border-slate-800">
            <div>
              <div className="text-xs font-mono text-slate-400">Current Starting Cash</div>
              <div className="text-2xl font-extrabold font-mono text-white mt-1">
                €{baselineForecast.start_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800" />

            <div>
              <div className="text-xs font-mono text-slate-400">Projected Min Balance</div>
              <div
                className={`text-2xl font-extrabold font-mono mt-1 ${
                  activeMinBalance < 8000 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                €{activeMinBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {scenarioForecast && (
              <>
                <div className="h-10 w-px bg-slate-800" />
                <div>
                  <div className="text-xs font-mono text-slate-400">6-Mo Net Impact</div>
                  <div
                    className={`text-2xl font-extrabold font-mono mt-1 ${
                      balanceDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {balanceDelta >= 0 ? '+' : ''}€{balanceDelta.toLocaleString('en-US')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scenario Control Deck */}
      <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
            Simulate Scenario:
          </span>

          {/* Scenario 1: Lose Client */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
            <UserX className="w-4 h-4 text-rose-400 ml-1.5" />
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="bg-transparent text-xs text-white border-none focus:outline-none pr-2 font-medium cursor-pointer"
            >
              <option value="c01" className="bg-slate-900">Atlas Co (c01)</option>
              <option value="c04" className="bg-slate-900">Nordwind Studio (c04)</option>
              <option value="c07" className="bg-slate-900">Kestrel Books (c07)</option>
            </select>
            <button
              disabled={isSimulating}
              onClick={() => handleLoseClient(selectedClient)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeScenarioType === 'lose_client'
                  ? 'bg-rose-600 text-white shadow-glow-rose'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              Simulate Loss
            </button>
          </div>

          {/* Scenario 2: Raise Prices */}
          <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
            <Percent className="w-4 h-4 text-emerald-400 ml-1.5" />
            <span className="text-xs text-slate-300 font-medium">Raise Prices:</span>
            {[5, 10, 15].map((pct) => (
              <button
                key={pct}
                disabled={isSimulating}
                onClick={() => {
                  setPriceHikePct(pct);
                  handleRaisePrices(pct);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
                  activeScenarioType === 'raise_prices' && priceHikePct === pct
                    ? 'bg-emerald-600 text-white shadow-glow-emerald'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                +{pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Reset button */}
        {activeScenarioType !== 'none' && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-mono transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Baseline</span>
          </button>
        )}
      </div>

      {/* Recharts Financial Curve */}
      <div className="glass-card rounded-3xl p-6 border border-slate-800 relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Cash Balance Trajectory (Oct 2026 – Mar 2027)
            </h3>
            <p className="text-xs text-slate-400">
              {scenarioForecast
                ? `Comparing baseline runway against '${activeScenarioType.replace('_', ' ')}'`
                : 'Projected baseline runway without client churn'}
            </p>
          </div>

          {activeScenarioType === 'lose_client' && (
            <div className="badge-rose text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              Warning: Runway reduced if {selectedClient} churns
            </div>
          )}
          {activeScenarioType === 'raise_prices' && (
            <div className="badge-emerald text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              Surplus: +{priceHikePct}% price increase accelerates cash reserves
            </div>
          )}
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBaseline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorScenario" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={activeScenarioType === 'lose_client' ? '#f43f5e' : '#8b5cf6'}
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor={activeScenarioType === 'lose_client' ? '#f43f5e' : '#8b5cf6'}
                    stopOpacity={0.0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
                formatter={(val: any) => [`€${Number(val).toLocaleString()}`, '']}
              />
              <Legend
                wrapperStyle={{ paddingTop: '15px' }}
                formatter={(value) => (
                  <span className="text-xs font-mono text-slate-300">
                    {value === 'baselineBalance'
                      ? 'Baseline Forecast'
                      : activeScenarioType === 'lose_client'
                      ? 'Scenario: Lose Client'
                      : 'Scenario: Price Increase'}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey="baselineBalance"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorBaseline)"
                name="baselineBalance"
              />
              {scenarioForecast && (
                <Area
                  type="monotone"
                  dataKey="scenarioBalance"
                  stroke={activeScenarioType === 'lose_client' ? '#f43f5e' : '#8b5cf6'}
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  fillOpacity={1}
                  fill="url(#colorScenario)"
                  name="scenarioBalance"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
