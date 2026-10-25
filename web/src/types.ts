// Shape matches backend/src/agents/types.ts and docs/contracts.md §3 strictly

export interface Evidence {
  id: string;
  view: string;
  sql: string;
  rows: Record<string, unknown>[];
  ran_at: string;
}

export type LeakType =
  | 'unbilled_hours'
  | 'price_rise'
  | 'unused_subscription'
  | 'late_payer'
  | 'underpriced_service'
  | 'duplicate_charge';

export type Confidence = 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  type: LeakType;
  title: string;
  client_id: string | null;
  subscription_id: string | null;
  monthly_impact_eur: number;
  cash_at_risk_eur: number;
  confidence: Confidence;
  evidence: Evidence[];
  detected_at: string;
}

export interface Cause {
  rank: number;
  cause: string;
  amount_eur: number;
  finding_id: string | null;
  evidence: Evidence[];
}

export interface Explanation {
  question: string;
  summary: string;
  causes: Cause[];
  uncertain: boolean;
  uncertainty_note: string | null;
}

export type Scenario =
  | { type: 'baseline' }
  | { type: 'lose_client'; client_id: string }
  | { type: 'raise_prices'; pct: number };

export interface ForecastMonth {
  month: string;
  inflow: number;
  outflow: number;
  balance: number;
}

export interface Forecast {
  scenario: Scenario;
  start_balance: number;
  months: ForecastMonth[];
  min_balance: number;
  runway_months: number | null;
}

export type ActionType =
  | 'bill_hours'
  | 'send_reminder'
  | 'cancel_subscription'
  | 'dispute_charge'
  | 'raise_rate';

export type Urgency = 'high' | 'medium' | 'low';
export type MoveStatus = 'pending' | 'approved' | 'rejected';

export interface Move {
  id: string;
  rank: number;
  title: string;
  action_type: ActionType;
  monthly_impact_eur: number;
  urgency: Urgency;
  reason: string;
  finding_ids: string[];
  memory_note: string | null;
  status: MoveStatus;
}

export interface Brief {
  run_id: string;
  generated_at: string;
  cash_today: number;
  what_changed: string[];
  moves: Move[];
  findings_count: number;
}

export type RunStep = 'leak_hunter' | 'explainer' | 'forecaster' | 'cfo';

export interface RunStatus {
  run_id: string;
  status: 'running' | 'done' | 'failed';
  step: RunStep | null;
  error: string | null;
}

export interface HealthResponse {
  ok: boolean;
  zetaris: boolean;
  nightshift: boolean;
  nightshift_status: 'online' | 'unauthorized' | 'offline';
}

// Contract v1.1 (docs/contracts.md section 5)

export type TraceEvent =
  | 'start' | 'done' | 'llm_failed' | 'llm_rejected' | 'markovian_done'
  | 'llm_call' | 'checks_done' | 'memory_applied' | 'critique' | 'escalated' | 'world_model_ingested';

export interface TraceLine {
  ts: string;
  run_id: string;
  step: string | null;
  event: TraceEvent | (string & {});
  data?: unknown;
}

export interface LlmCallData { model: string; ms: number; ok: boolean }
export interface CritiqueData { agent: 'explainer' | 'cfo'; problems: string[]; revised: boolean }
export interface EscalatedData { finding_ids: string[]; reason: 'low_confidence' }

export interface ActionDraft {
  move_id: string;
  kind: 'email' | 'steps' | 'invoice_lines';
  subject: string | null;
  body: string;
  ungrounded: number[];
}

export interface Entity {
  id: string;
  kind: 'client' | 'subscription';
  name: string;
  summary: string;
  facts: Record<string, string | number>;
  findings: Finding[];
  invoices: Record<string, unknown>[];
}

export interface Memory {
  id: string;
  text: string;
  decision: 'approve' | 'reject';
  action_type: ActionType;
  created_at: string;
}

export interface RunChanges {
  previous_run_id: string | null;
  new: Finding[];
  resolved: Finding[];
  changed: { finding_id: string; field: string; before: number; after: number }[];
}
