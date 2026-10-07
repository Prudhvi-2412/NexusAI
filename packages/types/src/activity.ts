import { ToolCall } from './chat';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface ActivityStep {
  id: string;
  name: string;
  type: 'planning' | 'memory_retrieval' | 'tool_execution' | 'delegation' | 'synthesis' | 'approval_wait';
  status: 'pending' | 'active' | 'completed' | 'failed';
  toolCall?: ToolCall;
  agentName: string;
  summary: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentRun {
  id: string;
  conversationId?: string;
  agentId: string;
  agentName: string;
  taskTitle: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  steps: ActivityStep[];
  currentStepIndex: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  error?: string;
}

export type ExecutionEventType =
  | 'run:init'
  | 'step:start'
  | 'step:update'
  | 'step:complete'
  | 'agent:handoff'
  | 'tool:start'
  | 'tool:end'
  | 'stream:chunk'
  | 'approval:required'
  | 'memory:suggestions'
  | 'run:complete'
  | 'run:paused'
  | 'run:error';

export interface ExecutionEvent {
  runId: string;
  type: ExecutionEventType;
  timestamp: string;
  data: Record<string, unknown>;
}
