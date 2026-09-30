export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ApprovalImpact = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalActionPayload {
  service: 'gmail' | 'calendar' | 'telegram' | 'browser' | 'database' | 'system';
  action: string;
  target: string;
  parameters: Record<string, unknown>;
  diff?: {
    before?: Record<string, unknown> | string;
    after?: Record<string, unknown> | string;
  };
}

export interface ApprovalRequest {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  impact: ApprovalImpact;
  status: ApprovalStatus;
  title: string;
  explanation: string;
  actionPayload: ApprovalActionPayload;
  requestedAt: string;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNotes?: string;
}

export interface ApprovalDecisionPayload {
  requestId: string;
  decision: 'approve' | 'reject';
  notes?: string;
  modifiedPayload?: Record<string, unknown>;
}
