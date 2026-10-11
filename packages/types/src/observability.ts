import { RunStatus } from './activity';

export interface TokenCostMetrics {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  tokensPerSecond: number | null;
}

export interface LatencyBreakdown {
  planningMs: number;
  toolExecutionMs: number;
  modelInferenceMs: number;
  totalMs: number;
}

export interface ObservabilityRun {
  id: string;
  agentId: string;
  agentName: string;
  taskTitle: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  toolsUsed: string[];
  toolCallCount: number;
  metrics: TokenCostMetrics;
  latency: LatencyBreakdown;
  hasErrors: boolean;
  errorMessage?: string;
  approvalRequired: boolean;
  approvalGranted?: boolean;
}

export interface SystemHealthSummary {
  activeRunsCount: number;
  successRate24h: number;
  averageLatencyMs: number;
  totalTokens24h: number | null;
  totalCost24hUsd: number | null;
  pendingApprovalsCount: number;
  connectedAppsCount: number;
  runs24h?: number;
  completedRuns24h?: number;
  failedRuns24h?: number;
  scheduledTasksCount?: number;
}
