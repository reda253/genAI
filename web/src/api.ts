import type {
  ActionDraft,
  Brief,
  Entity,
  Explanation,
  Finding,
  Forecast,
  HealthResponse,
  Memory,
  Move,
  RunChanges,
  RunStatus,
  Scenario,
  TraceLine,
} from './types';

import rawBrief from './mock/brief.json';
import rawExplanation from './mock/explanation.json';
import rawFindings from './mock/findings.json';
import rawForecast from './mock/forecast.json';
import rawWhatIf from './mock/what_if.json';

// Empty string = same origin (the Docker image serves web and API on one port).
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
// Live API by default; mock data only when explicitly asked for (VITE_USE_MOCKS=true or the navbar toggle).
const DEFAULT_USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

const defaultInitialMemories: Memory[] = [
  {
    id: 'mem_01',
    text: 'Prioritize unbilled hours (bill_hours) above overdue reminders when impact > €1,000',
    decision: 'approve',
    action_type: 'bill_hours',
    created_at: '2026-10-01T08:05:00Z',
  },
  {
    id: 'mem_02',
    text: 'Always challenge duplicate SaaS charges under €50 immediately',
    decision: 'approve',
    action_type: 'dispute_charge',
    created_at: '2026-10-01T08:06:12Z',
  },
];

// Runtime mock store so user approvals/rejections persist during the session
let mockBriefState: Brief = JSON.parse(JSON.stringify(rawBrief));
const mockFindingsState: Finding[] = JSON.parse(JSON.stringify(rawFindings));
const mockForecastState: Forecast = JSON.parse(JSON.stringify(rawForecast));
const mockWhatIfState = JSON.parse(JSON.stringify(rawWhatIf));
let mockMemoriesState: Memory[] = [...defaultInitialMemories];

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

  // GET /api/runs/:id/trace (contract v1.1).
  public async getTrace(runId: string): Promise<TraceLine[]> {
    if (this.useMocks) {
      const isPastRun = !this.mockRunStartTimes.has(runId);
      const startTime = this.mockRunStartTimes.get(runId) || (Date.now() - 10000);
      const elapsed = isPastRun ? 10000 : (Date.now() - startTime);
      const lines: TraceLine[] = [
        { ts: new Date(startTime).toISOString(), run_id: runId, step: null, event: 'start' },
        {
          ts: new Date(startTime + 250).toISOString(),
          run_id: runId,
          step: 'leak_hunter',
          event: 'checks_done',
          data: { count: 6, view: 'zetaris_views' },
        },
        {
          ts: new Date(startTime + 800).toISOString(),
          run_id: runId,
          step: 'leak_hunter',
          event: 'llm_call',
          data: { model: 'NVIDIA Nemotron 3.5 Lightning', ms: 790, ok: true },
        },
      ];

      if (elapsed > 1200) {
        lines.push(
          {
            ts: new Date(startTime + 1500).toISOString(),
            run_id: runId,
            step: 'explainer',
            event: 'llm_call',
            data: { model: 'NVIDIA Nemotron 3.5 Ultra', ms: 1420, ok: true },
          },
          {
            ts: new Date(startTime + 1900).toISOString(),
            run_id: runId,
            step: 'explainer',
            event: 'markovian_done',
            data: { chunks: 3 },
          },
          {
            ts: new Date(startTime + 2200).toISOString(),
            run_id: runId,
            step: 'explainer',
            event: 'critique',
            data: {
              agent: 'explainer',
              problems: ['Amount €650 not grounded in Zetaris evidence rows'],
              revised: true,
            },
          }
        );
      }

      if (elapsed > 2400) {
        lines.push(
          {
            ts: new Date(startTime + 2800).toISOString(),
            run_id: runId,
            step: 'forecaster',
            event: 'llm_call',
            data: { model: 'NVIDIA Nemotron 3.5 Lightning', ms: 580, ok: true },
          }
        );
      }

      if (elapsed > 3600) {
        lines.push(
          {
            ts: new Date(startTime + 3900).toISOString(),
            run_id: runId,
            step: 'cfo',
            event: 'memory_applied',
            data: { count: 1, text: 'H-MEM applied: deprioritized disputed charge' },
          },
          {
            ts: new Date(startTime + 4300).toISOString(),
            run_id: runId,
            step: 'cfo',
            event: 'llm_call',
            data: { model: 'NVIDIA Nemotron 3.5 Ultra', ms: 1105, ok: true },
          }
        );
      }

      if (elapsed >= 4800) {
        lines.push({
          ts: new Date(startTime + 4750).toISOString(),
          run_id: runId,
          step: null,
          event: 'done',
        });
      }

      return lines;
    }
    return this.request<TraceLine[]>(`/api/runs/${encodeURIComponent(runId)}/trace`);
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
      // Add to mock memories
      mockMemoriesState.unshift({
        id: `mem_${Date.now()}`,
        text: `${decision === 'approve' ? 'Prioritize' : 'Deprioritize'} ${move.title} (${move.action_type})`,
        decision,
        action_type: move.action_type,
        created_at: new Date().toISOString(),
      });
      return JSON.parse(JSON.stringify(move));
    }
    return this.request<Move>(`/api/moves/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, note: note ?? null }),
    });
  }

  // Contract v1.1: POST /api/moves/:id/draft
  public async draftMove(moveId: string): Promise<ActionDraft> {
    if (this.useMocks) {
      const move = mockBriefState.moves.find((m) => m.id === moveId);
      if (moveId === 'm001' || move?.action_type === 'bill_hours') {
        return {
          move_id: moveId,
          kind: 'invoice_lines',
          subject: 'Invoice: Professional Services (August – September 2026)',
          body: `Client: Atlas Co (c01)\n\nLine Item 1: August 2026 Unbilled Development Work\nQuantity: 12 hours @ €60.00/h = €720.00\n\nLine Item 2: September 2026 Unbilled Architecture Review\nQuantity: 10 hours @ €60.00/h = €600.00\n\n────────────────────────────────────────\nTotal Invoice Amount Due: 1,320.00 EUR\nPayment Terms: Net 30\nIBAN: FR76 3000 4000 5000 6000 7000 123`,
          ungrounded: [],
        };
      }
      if (moveId === 'm002' || move?.action_type === 'send_reminder') {
        return {
          move_id: moveId,
          kind: 'email',
          subject: 'Payment Reminder: Outstanding Invoices #inv0031 & #inv0038 (4,800.00 EUR)',
          body: `Dear Nordwind Studio Team,\n\nI hope this message finds you well.\n\nAccording to our accounts receivable records, we have two outstanding invoices past the agreed payment window:\n\n• Invoice inv0031: €2,400.00 (47 days overdue)\n• Invoice inv0038: €2,400.00 (33 days overdue)\nTotal Balance Due: 4,800.00 EUR\n\nPlease let us know if you need any clarification or if payment is already scheduled for processing.\n\nBest regards,\nSara\nFinance Lead`,
          ungrounded: [],
        };
      }
      if (moveId === 'm003' || move?.action_type === 'cancel_subscription') {
        return {
          move_id: moveId,
          kind: 'steps',
          subject: null,
          body: `1. Open Webflow workspace at dashboard.webflow.com/dashboard/billing\n2. Navigate to Plans & Billing > Workspace Plan (CMS Tier).\n3. Click "Cancel Plan" (0 team logins recorded in the past 94 days since 2026-06-29).\n4. Select "Downgrade to Starter Free Workspace".\n5. Verify confirmation email & confirm recurring savings of 29.00 EUR/month.`,
          ungrounded: [],
        };
      }
      return {
        move_id: moveId,
        kind: 'email',
        subject: `Action: ${move?.title ?? 'Financial Update'}`,
        body: `Hello,\n\nPlease review the following financial update regarding ${move?.title ?? 'your account'}.\n\nImpact: ${move?.monthly_impact_eur ?? 0} EUR/month\nReason: ${move?.reason ?? 'Financial optimization'}\n\nBest regards,\nSara`,
        ungrounded: [],
      };
    }
    return this.request<ActionDraft>(`/api/moves/${moveId}/draft`, {
      method: 'POST',
    });
  }

  // Contract v1.1: GET /api/entities/:id
  public async getEntity(id: string): Promise<Entity> {
    if (this.useMocks) {
      if (id === 'c01') {
        return {
          id: 'c01',
          kind: 'client',
          name: 'Atlas Co',
          summary: 'Atlas Co (Custom Software Development) billed at €60/h (market: €60/h) with 22 unbilled hours accumulated across August and September 2026.',
          facts: {
            client_id: 'c01',
            client_name: 'Atlas Co',
            service: 'Custom Software Development',
            hourly_rate: 60,
            market_rate: 60,
            unbilled_hours: 22,
            unbilled_pct: 21.6,
            payment_terms: 'Net 30',
            status: 'Active',
          },
          findings: mockFindingsState.filter((f) => f.client_id === 'c01'),
          invoices: [
            { invoice_id: 'inv0012', amount: 3600, date: '2026-07-31', status: 'paid' },
            { invoice_id: 'inv0024', amount: 2400, date: '2026-08-31', status: 'paid' },
          ],
        };
      }
      if (id === 'c04') {
        return {
          id: 'c04',
          kind: 'client',
          name: 'Nordwind Studio',
          summary: 'Nordwind Studio (UI/UX Design) billed at €65/h with 2 overdue invoices totaling €4,800 cash at risk (average 47 days late).',
          facts: {
            client_id: 'c04',
            client_name: 'Nordwind Studio',
            service: 'UI/UX Design Systems',
            hourly_rate: 65,
            cash_at_risk: 4800,
            avg_days_late: 47,
            payment_terms: 'Net 15',
            status: 'Payment Delay Risk',
          },
          findings: mockFindingsState.filter((f) => f.client_id === 'c04'),
          invoices: [
            { invoice_id: 'inv0031', amount: 2400, days_late: 47, bucket: '>30 days', status: 'overdue' },
            { invoice_id: 'inv0038', amount: 2400, days_late: 33, bucket: '>30 days', status: 'overdue' },
          ],
        };
      }
      if (id === 'c07') {
        return {
          id: 'c07',
          kind: 'client',
          name: 'Kestrel Media',
          summary: 'Kestrel Media (Brand Motion & Video) billed at €42/h against a market benchmark of €60/h (-30% underpriced gap on 30h/month).',
          facts: {
            client_id: 'c07',
            client_name: 'Kestrel Media',
            service: 'Brand Motion & Video',
            hourly_rate: 42,
            market_rate: 60,
            monthly_hours: 30,
            monthly_leak_eur: 540,
            status: 'Underpriced Rate',
          },
          findings: mockFindingsState.filter((f) => f.client_id === 'c07'),
          invoices: [
            { invoice_id: 'inv0040', amount: 1260, date: '2026-09-30', status: 'paid' },
          ],
        };
      }
      if (id === 'sub02') {
        return {
          id: 'sub02',
          kind: 'subscription',
          name: 'Adobe Creative Cloud',
          summary: 'Adobe Creative Cloud (All Apps Team) increased from €66.99 to €80.99/month (+20.9% price rise) without team notification.',
          facts: {
            subscription_id: 'sub02',
            vendor: 'Adobe',
            plan: 'All Apps Team License',
            monthly_cost: 80.99,
            previous_cost: 66.99,
            price_change_pct: 20.9,
            category: 'Design & Motion',
            status: 'Price Hike Detected',
          },
          findings: mockFindingsState.filter((f) => f.subscription_id === 'sub02'),
          invoices: [
            { invoice_id: 'sub_inv_08', amount: 80.99, date: '2026-08-15', status: 'auto_debited' },
            { invoice_id: 'sub_inv_09', amount: 80.99, date: '2026-09-15', status: 'auto_debited' },
          ],
        };
      }
      if (id === 'sub03') {
        return {
          id: 'sub03',
          kind: 'subscription',
          name: 'Figma Organization',
          summary: 'Figma Organization billed twice in August 2026 (€15.00 duplicate seat charge anomaly detected).',
          facts: {
            subscription_id: 'sub03',
            vendor: 'Figma',
            plan: 'Professional Editor',
            monthly_cost: 15.00,
            duplicate_charges: 1,
            category: 'UI/UX Tools',
            status: 'Duplicate Billing',
          },
          findings: mockFindingsState.filter((f) => f.subscription_id === 'sub03'),
          invoices: [
            { invoice_id: 'figma_aug_1', amount: 15, date: '2026-08-01', status: 'paid' },
            { invoice_id: 'figma_aug_2', amount: 15, date: '2026-08-03', status: 'duplicate_paid' },
          ],
        };
      }
      if (id === 'sub05') {
        return {
          id: 'sub05',
          kind: 'subscription',
          name: 'Webflow CMS Plan',
          summary: 'Webflow CMS workspace seat has recorded 0 user logins in 94 days (last active 2026-06-29) while incurring €29.00/month.',
          facts: {
            subscription_id: 'sub05',
            vendor: 'Webflow',
            plan: 'CMS Workspace Tier',
            monthly_cost: 29.00,
            days_since_login: 94,
            last_login_date: '2026-06-29',
            category: 'Web Publishing',
            status: 'Zombie Subscription',
          },
          findings: mockFindingsState.filter((f) => f.subscription_id === 'sub05'),
          invoices: [
            { invoice_id: 'wf_07', amount: 29, date: '2026-07-01', status: 'auto_debited' },
            { invoice_id: 'wf_08', amount: 29, date: '2026-08-01', status: 'auto_debited' },
            { invoice_id: 'wf_09', amount: 29, date: '2026-09-01', status: 'auto_debited' },
          ],
        };
      }
      // Generic fallback entity
      return {
        id,
        kind: id.startsWith('c') ? 'client' : 'subscription',
        name: id.startsWith('c') ? `Client ${id}` : `Subscription ${id}`,
        summary: `Entity record ${id} indexed in Zetaris semantic views and World Model.`,
        facts: { id, status: 'Active' },
        findings: mockFindingsState.filter((f) => f.client_id === id || f.subscription_id === id),
        invoices: [],
      };
    }
    return this.request<Entity>(`/api/entities/${id}`);
  }

  // Contract v1.1: GET /api/changes
  public async getChanges(): Promise<RunChanges> {
    if (this.useMocks) {
      return {
        previous_run_id: 'run_20260930_080000',
        new: [mockFindingsState[1]], // f002 unbilled hours
        resolved: [],
        changed: [
          { finding_id: 'f001', field: 'days_late', before: 42, after: 47 },
        ],
      };
    }
    return this.request<RunChanges>('/api/changes');
  }

  // Contract v1.1: GET /api/memories
  public async getMemories(): Promise<Memory[]> {
    if (this.useMocks) {
      return JSON.parse(JSON.stringify(mockMemoriesState));
    }
    return this.request<Memory[]>('/api/memories');
  }

  // Contract v1.1: DELETE /api/memories/:id
  public async deleteMemory(id: string): Promise<void> {
    if (this.useMocks) {
      mockMemoriesState = mockMemoriesState.filter((m) => m.id !== id);
      return;
    }
    await this.request<void>(`/api/memories/${id}`, { method: 'DELETE' });
  }

  // Reset demo state
  public resetMockData(): void {
    mockBriefState = JSON.parse(JSON.stringify(rawBrief));
    mockMemoriesState = [...defaultInitialMemories];
  }
}

export const api = new ApiService();
