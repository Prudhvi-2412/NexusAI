export interface MCPServer {
  id: string;
  name: string;
  url: string;
  hasToken: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MCPServerInput {
  name: string;
  url: string;
  token?: string;
  clearToken?: boolean;
}

export interface MCPServerTestResult {
  connected: boolean;
  tools: Array<{
    name: string;
    title: string;
    readOnly: boolean;
    requiresApproval: boolean;
  }>;
}
