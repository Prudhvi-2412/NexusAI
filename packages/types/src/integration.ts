export type IntegrationType =
  | 'gmail'
  | 'google_calendar'
  | 'telegram'
  | 'browser_playwright'
  | 'slack'
  | 'notion'
  | 'github'
  | 'custom_mcp';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export interface IntegrationScope {
  name: string;
  description: string;
  isGranted: boolean;
}

export interface ConnectedApp {
  id: string;
  type: IntegrationType;
  name: string;
  description: string;
  icon: string;
  status: IntegrationStatus;
  accountEmail?: string;
  accountHandle?: string;
  mcpServerName: string;
  mcpServerEndpoint?: string;
  scopes: IntegrationScope[];
  toolsProvided: string[];
  lastSyncedAt?: string;
  errorMessage?: string;
  authUrl?: string;
}
