// Shapes from docs/contracts.md §3. Field names are the JSON contract: keep snake_case.

export interface Evidence {
  id: string;
  view: string;
  sql: string;
  rows: Record<string, unknown>[];
  ran_at: string;
}

export type LeakType =
  | 'unbilled_hours' | 'price_rise' | 'unused_subscription'
  | 'late_payer' | 'underpriced_service' | 'duplicate_charge';
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

export interface ForecastMonth { month: string; inflow: number; outflow: number; balance: number }

export interface Forecast {
  scenario: Scenario;
  start_balance: number;
  months: ForecastMonth[];
  min_balance: number;
  runway_months: number | null;
}

export type ActionType = 'bill_hours' | 'send_reminder' | 'cancel_subscription' | 'dispute_charge' | 'raise_rate';
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
export interface RunStatus { run_id: string; status: 'running' | 'done' | 'failed'; step: RunStep | null; error: string | null }

export interface QueryResult { rows: Record<string, unknown>[]; sql: string; ranAt: string }

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatOptions { model?: string; maxTokens?: number; temperature?: number }
export interface Llm {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  generate(prompt: string): Promise<string>;
  listModels(): Promise<string[]>;
}

export interface AgentContext {
  runId: string;
  llm: Llm;
  sql: (sql: string) => Promise<QueryResult>;
  trace: (event: string, data?: unknown) => void;
}
