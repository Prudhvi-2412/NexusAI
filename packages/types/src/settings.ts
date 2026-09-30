export type ModelProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama_local';

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  temperature: number;
  maxOutputTokens: number;
  apiKeySet: boolean;
  streamingEnabled: boolean;
}

export interface GuardrailSettings {
  autonomyLevel: 'strict_approval' | 'balanced' | 'autonomous_safe';
  requireApprovalForEmailSend: boolean;
  requireApprovalForCalendarCreate: boolean;
  requireApprovalForTelegramSend: boolean;
  requireApprovalForBrowserActions: boolean;
  requireApprovalForFinancials: boolean;
  maxConcurrentAgents: number;
  maxToolCallsPerRun: number;
  dailyCostBudgetUsd: number;
}

export interface UserProfileSettings {
  name: string;
  email: string;
  timezone: string;
  locale: string;
  preferredTone: 'executive' | 'concise' | 'technical' | 'casual';
  theme: 'dark' | 'light' | 'system';
}

export interface NotificationSettings {
  emailAlerts: boolean;
  telegramAlerts: boolean;
  browserPush: boolean;
  notifyOnApprovalRequired: boolean;
  notifyOnTaskFailure: boolean;
  dailyDigestTime: string;
}

export interface SystemSettings {
  user: UserProfileSettings;
  model: ModelConfig;
  guardrails: GuardrailSettings;
  notifications: NotificationSettings;
}
