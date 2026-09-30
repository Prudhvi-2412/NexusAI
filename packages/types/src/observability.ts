import { RunStatus } from './activity';

export interface TokenCostMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  tokensPerSecond: number;
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
  totalTokens24h: number;
  totalCost24hUsd: number;
  pendingApprovalsCount: number;
  connectedAppsCount: number;
}
