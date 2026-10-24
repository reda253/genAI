import type {
  Brief,
  Explanation,
  Finding,
  Forecast,
  HealthResponse,
  Move,
  RunStatus,
  Scenario,
} from './types';

import rawBrief from './mock/brief.json';
import rawExplanation from './mock/explanation.json';
import rawFindings from './mock/findings.json';
import rawForecast from './mock/forecast.json';
import rawWhatIf from './mock/what_if.json';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const DEFAULT_USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

// Runtime mock store so user approvals/rejections persist during the session
let mockBriefState: Brief = JSON.parse(JSON.stringify(rawBrief));
const mockFindingsState: Finding[] = JSON.parse(JSON.stringify(rawFindings));
const mockForecastState: Forecast = JSON.parse(JSON.stringify(rawForecast));
const mockWhatIfState = JSON.parse(JSON.stringify(rawWhatIf));

class ApiService {
  private useMocks: boolean = DEFAULT_USE_MOCKS;
  private listeners: Set<(useMocks: boolean) => void> = new Set();
  private mockRunStartTimes: Map<string, number> = new Map();

  constructor() {
    const saved = localStorage.getItem('ledger_lens_use_mocks');
    if (saved !== null) {
      this.useMocks = saved === 'true';
    }
  }

  public getIsMockMode(): boolean {
    return this.useMocks;
  }

  public setMockMode(enabled: boolean): void {
    this.useMocks = enabled;
    localStorage.setItem('ledger_lens_use_mocks', String(enabled));
    this.listeners.forEach((cb) => cb(this.useMocks));
  }

  public subscribeMockMode(cb: (useMocks: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      let errPayload: any;
      try {
        errPayload = await res.json();
      } catch {
        errPayload = { error: { code: 'http_error', message: res.statusText } };
      }
      const error = new Error(errPayload?.error?.message || `HTTP ${res.status}`);
      (error as any).code = errPayload?.error?.code;
      (error as any).status = res.status;
      throw error;
    }

    return res.json() as Promise<T>;
  }

  // 1. GET /api/health
  public async getHealth(): Promise<HealthResponse> {
    if (this.useMocks) {
      return {
        ok: true,
        zetaris: true,
        nightshift: true,
        nightshift_status: 'online',
      };
    }
    return this.request<HealthResponse>('/api/health');
  }

  // 2. POST /api/runs
  public async startRun(): Promise<{ run_id: string; status: string }> {
    if (this.useMocks) {
      const run_id = `run_${Date.now()}`;
      this.mockRunStartTimes.set(run_id, Date.now());
      return { run_id, status: 'running' };
    }
    return this.request<{ run_id: string; status: string }>('/api/runs', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // 3. GET /api/runs/:id
  public async getRun(runId: string): Promise<RunStatus> {
    if (this.useMocks) {
      const startTime = this.mockRunStartTimes.get(runId) || Date.now() - 5000;
      const elapsed = Date.now() - startTime;

      if (elapsed < 1200) {
        return { run_id: runId, status: 'running', step: 'leak_hunter', error: null };
      }
      if (elapsed < 2400) {
        return { run_id: runId, status: 'running', step: 'explainer', error: null };
      }
      if (elapsed < 3600) {
        return { run_id: runId, status: 'running', step: 'forecaster', error: null };
      }
      if (elapsed < 4800) {
        return { run_id: runId, status: 'running', step: 'cfo', error: null };
      }
      return { run_id: runId, status: 'done', step: null, error: null };
    }
    return this.request<RunStatus>(`/api/runs/${runId}`);
  }

  // 4. GET /api/brief
  public async getBrief(): Promise<Brief> {
    if (this.useMocks) {
      return JSON.parse(JSON.stringify(mockBriefState));
    }
    return this.request<Brief>('/api/brief');
  }

  // 5. GET /api/findings
  public async getFindings(): Promise<Finding[]> {
    if (this.useMocks) {
      return JSON.parse(JSON.stringify(mockFindingsState));
    }
    return this.request<Finding[]>('/api/findings');
  }

  // 6. GET /api/findings/:id
  public async getFinding(id: string): Promise<Finding> {
    if (this.useMocks) {
      const found = mockFindingsState.find((f) => f.id === id);
      if (!found) {
        const err = new Error(`Finding ${id} not found`);
        (err as any).code = 'not_found';
        (err as any).status = 404;
        throw err;
      }
      return JSON.parse(JSON.stringify(found));
    }
    return this.request<Finding>(`/api/findings/${id}`);
  }

  // 7. POST /api/explain
  public async explain(question: string, findingId?: string | null): Promise<Explanation> {
    if (this.useMocks) {
      return {
        ...rawExplanation,
        question: question || rawExplanation.question,
      } as Explanation;
    }
    return this.request<Explanation>('/api/explain', {
      method: 'POST',
      body: JSON.stringify({ question, finding_id: findingId ?? null }),
    });
  }

  // 8. GET /api/forecast
  public async getForecast(): Promise<Forecast> {
    if (this.useMocks) {
      return JSON.parse(JSON.stringify(mockForecastState));
    }
    return this.request<Forecast>('/api/forecast');
  }

  // 9. POST /api/forecast/what-if
  public async whatIf(scenario: Scenario): Promise<{ baseline: Forecast; scenario: Forecast }> {
    if (this.useMocks) {
      if (scenario.type === 'lose_client') {
        return JSON.parse(JSON.stringify(mockWhatIfState));
      }
      if (scenario.type === 'raise_prices') {
        const pct = scenario.pct;
        const baseline = JSON.parse(JSON.stringify(mockForecastState)) as Forecast;
        const modifiedMonths = baseline.months.map((m) => {
          const newInflow = Math.round(m.inflow * (1 + pct / 100));
          return {
            ...m,
            inflow: newInflow,
            balance: m.balance + Math.round((newInflow - m.inflow) * 1.5),
          };
        });
        const scenarioForecast: Forecast = {
          scenario,
          start_balance: baseline.start_balance,
          months: modifiedMonths,
          min_balance: Math.min(...modifiedMonths.map((m) => m.balance)),
          runway_months: null,
        };
        return { baseline, scenario: scenarioForecast };
      }
      return { baseline: mockForecastState, scenario: mockForecastState };
    }
    return this.request<{ baseline: Forecast; scenario: Forecast }>('/api/forecast/what-if', {
      method: 'POST',
      body: JSON.stringify(scenario),
    });
  }

  // 10. POST /api/moves/:id/decision
  public async decide(id: string, decision: 'approve' | 'reject', note?: string | null): Promise<Move> {
    if (this.useMocks) {
      const move = mockBriefState.moves.find((m) => m.id === id);
      if (!move) {
        const err = new Error(`Move ${id} not found`);
        (err as any).code = 'not_found';
        (err as any).status = 404;
        throw err;
      }
      move.status = decision === 'approve' ? 'approved' : 'rejected';
      if (note) {
        move.memory_note = note;
      } else if (decision === 'approve') {
        move.memory_note = 'Approved by Sara. Stored in Meterless H-MEM for next run prioritization.';
      } else {
        move.memory_note = 'Rejected by Sara. Stored in Meterless H-MEM; will be deprioritized.';
      }
      return JSON.parse(JSON.stringify(move));
    }
    return this.request<Move>(`/api/moves/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, note: note ?? null }),
    });
  }

  // Reset demo state
  public resetMockData(): void {
    mockBriefState = JSON.parse(JSON.stringify(rawBrief));
  }
}

export const api = new ApiService();
