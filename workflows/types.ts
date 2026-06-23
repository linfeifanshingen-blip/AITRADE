/**
 * Shared types for workflow steps.
 *
 * All step files import from here — do NOT redefine these locally.
 */

export type Emit = (event: string, data: any) => void;

export interface AnalystReports {
  macro_report: string;
  market_report: string;
  intelligence_report: string;
  fundamentals_report: string;
}

export interface UserPositionContext {
  hasPosition: boolean;
  averageCost?: number | null;
}

export type ModelProvider = 'deepseek' | 'google' | 'zhipu';

export interface DebateState {
  bull_history: string;
  bear_history: string;
  history: string;
  count: number;
}

export interface RiskState {
  aggressive_history: string;
  neutral_history: string;
  conservative_history: string;
  history: string;
  count: number;
}

export type AgentEvent =
  | { event: 'started'; runId: string; ticker: string; date: string; userContext?: UserPositionContext; modelProvider?: ModelProvider }
  | { event: 'agent'; node: string; status: 'pending' | 'running' | 'done'; report?: string; elapsed?: number }
  | { event: 'agent-progress'; node: string; message: string }
  | { event: 'stream'; node: string; delta: string }
  | { event: 'debate'; phase: 'research' | 'risk'; side: string; history: string; round?: number; elapsed?: number; status?: string }
  | { event: 'debate-stream'; phase: 'research' | 'risk'; side: string; delta: string }
  | { event: 'done'; decision_raw: string; elapsed: number }
  | { event: 'complete'; decision: string; decision_label?: string; final_decision?: any; user_context?: UserPositionContext; runId: string; duration: number }
  | { event: 'error'; node?: string; message: string }
  | { event: 'warn'; message: string };

export interface RunState {
  runId: string;
  ticker: string;
  date: string;
  userContext?: UserPositionContext;
  modelProvider?: ModelProvider;
  startedAt: number;
  finishedAt?: number;
  macro_report?: string;
  market_report?: string;
  intelligence_report?: string;
  fundamentals_report?: string;
  investment_debate?: { bull_history: string; bear_history: string; count: number };
  research_plan?: any;
  trader_plan?: any;
  risk_debate?: { aggressive_history: string; neutral_history: string; conservative_history: string; count: number };
  final_decision?: any;
  duration_seconds?: number;
}
