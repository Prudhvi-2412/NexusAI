export type AgentRole =
  | 'supervisor'
  | 'executive_secretary'
  | 'calendar_agent'
  | 'comms_agent'
  | 'research_agent'
  | 'browser_agent'
  | 'memory_curator';

export type AgentStatus = 'idle' | 'running' | 'waiting_approval' | 'paused' | 'error';

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  mcpServer: string;
  requiresApproval: boolean;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  avatar?: string;
  description: string;
  status: AgentStatus;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  capabilities: AgentCapability[];
  createdAt: string;
  updatedAt: string;
}
