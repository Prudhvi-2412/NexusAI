export type TaskStatus = 'scheduled' | 'running' | 'completed' | 'failed' | 'paused';
export type TaskTriggerType = 'cron' | 'interval' | 'event' | 'webhook';

export interface TaskSchedule {
  type: TaskTriggerType;
  cronExpression?: string; // e.g. "0 9 * * 1-5"
  intervalMinutes?: number;
  timezone: string;
  nextExecutionTime: string;
  lastExecutionTime?: string;
}

export interface TaskRunSummary {
  runId: string;
  timestamp: string;
  status: 'success' | 'failure';
  durationMs: number;
  summary: string;
}

export interface ScheduledTask {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  assignedAgentName: string;
  schedule: TaskSchedule;
  status: TaskStatus;
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requiresHumanApproval: boolean;
  targetMcpServers: string[];
  lastRuns?: TaskRunSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  title: string;
  description: string;
  assignedAgentId: string;
  cronExpression?: string;
  intervalMinutes?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requiresHumanApproval: boolean;
  targetMcpServers?: string[];
}
