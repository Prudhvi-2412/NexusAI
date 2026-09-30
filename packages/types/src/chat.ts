export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type ToolCallStatus = 'pending' | 'executing' | 'success' | 'failed' | 'requires_approval';

export interface ToolCall {
  id: string;
  name: string;
  server: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface ExecutionSummaryStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: string;
  durationMs?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  agentId?: string;
  agentName?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  // Safe agent summary without exposing raw chain-of-thought
  executionSummary?: ExecutionSummaryStep[];
  isStreaming?: boolean;
  approvalRequestId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
  messageCount: number;
  activeAgentId?: string;
  pinned?: boolean;
  tags?: string[];
}
