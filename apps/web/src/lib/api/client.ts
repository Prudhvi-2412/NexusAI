import {
  Agent,
  AgentRun,
  ApprovalDecisionPayload,
  ApprovalRequest,
  ConnectedApp,
  Conversation,
  CreateTaskPayload,
  Memory,
  MemorySuggestion,
  MemorySearchParams,
  MCPServer,
  MCPServerInput,
  MCPServerTestResult,
  Message,
  ObservabilityRun,
  ScheduledTask,
  SystemHealthSummary,
  SystemSettings,
} from './types';
import {
  MOCK_AGENTS,
  MOCK_APPROVALS,
  MOCK_CONNECTED_APPS,
  MOCK_CONVERSATIONS,
  MOCK_MEMORIES,
  MOCK_MESSAGES,
  MOCK_OBSERVABILITY_RUNS,
  MOCK_SETTINGS,
  MOCK_SYSTEM_HEALTH,
  MOCK_TASKS,
} from './mock-data';
import { simulateAgentStream, StreamListener } from './sse-simulator';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false';
const apiFetch: typeof fetch = (input, init = {}) => fetch(input, { ...init, credentials: 'include' });

// Stateful in-memory stores for interactive mock experience
let conversationsStore = [...MOCK_CONVERSATIONS];
let messagesStore = [...MOCK_MESSAGES];
let memoriesStore = [...MOCK_MEMORIES];
let tasksStore = [...MOCK_TASKS];
let approvalsStore = [...MOCK_APPROVALS];
let integrationsStore = [...MOCK_CONNECTED_APPS];
let settingsStore = { ...MOCK_SETTINGS };

export const api = {
  // --- Agents ---
  async getAgents(): Promise<Agent[]> {
    if (USE_MOCK) return MOCK_AGENTS;
    const res = await apiFetch(`${API_BASE_URL}/agents`);
    if (!res.ok) throw new Error('Failed to fetch agents');
    return res.json();
  },

  // --- Conversations & Messages ---
  async getConversations(): Promise<Conversation[]> {
    if (USE_MOCK) return [...conversationsStore];
    const res = await apiFetch(`${API_BASE_URL}/conversations`);
    if (!res.ok) throw new Error('Failed to fetch conversations');
    return res.json();
  },

  async createConversation(title?: string): Promise<Conversation> {
    if (USE_MOCK) {
      const newConv: Conversation = {
        id: `conv_${Date.now()}`,
        title: title || 'New Agent Session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        activeAgentId: 'agent_supervisor',
      };
      conversationsStore.unshift(newConv);
      return newConv;
    }
    const res = await apiFetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to create conversation');
    return res.json();
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    if (USE_MOCK) {
      return messagesStore.filter((m) => m.conversationId === conversationId);
    }
    const res = await apiFetch(`${API_BASE_URL}/conversations/${conversationId}/messages`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },

  async addMessage(msg: Partial<Message>): Promise<Message> {
    const fullMsg: Message = {
      id: msg.id || `msg_${Date.now()}`,
      conversationId: msg.conversationId || 'conv_1',
      role: msg.role || 'user',
      content: msg.content || '',
      createdAt: msg.createdAt || new Date().toISOString(),
      agentId: msg.agentId,
      agentName: msg.agentName,
      toolCalls: msg.toolCalls,
      toolResults: msg.toolResults,
      executionSummary: msg.executionSummary,
      approvalRequestId: msg.approvalRequestId,
    };
    if (USE_MOCK) {
      messagesStore.push(fullMsg);
      const conv = conversationsStore.find((c) => c.id === fullMsg.conversationId);
      if (conv) {
        conv.updatedAt = new Date().toISOString();
        conv.messageCount += 1;
        conv.lastMessagePreview = fullMsg.content.slice(0, 80);
      }
      return fullMsg;
    }
    const res = await apiFetch(`${API_BASE_URL}/conversations/${fullMsg.conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullMsg),
    });
    if (!res.ok) throw new Error('Failed to post message');
    return res.json();
  },

  // --- Real-time Agent Streaming ---
  streamAgentRun(
    message: string,
    conversationId: string,
    callbacks: StreamListener,
    abortSignal?: AbortSignal,
    resumeRunId?: string,
  ): () => void {
    if (USE_MOCK) {
      return simulateAgentStream(resumeRunId ? `Resume ${resumeRunId}` : message, callbacks, abortSignal);
    }

    let isAborted = false;
    const controller = new AbortController();

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        isAborted = true;
        controller.abort();
      });
    }

    async function startStream() {
      try {
        const response = await apiFetch(resumeRunId ? `${API_BASE_URL}/agent/runs/${resumeRunId}/resume` : `${API_BASE_URL}/agent/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: resumeRunId ? undefined : JSON.stringify({ message, conversationId }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE stream failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!isAborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const [eventLine, dataLine] = line.split('\n');
              const eventType = eventLine.replace('event: ', '').trim();
              const rawData = dataLine?.replace('data: ', '').trim();
              if (rawData) {
                const data = JSON.parse(rawData);
                if (eventType === 'stream:chunk') {
                  callbacks.onChunk(data.delta || '');
                } else {
                  callbacks.onEvent({
                    runId: data.runId || 'real_run',
                    type: eventType as any,
                    timestamp: new Date().toISOString(),
                    data,
                  });
                }
              }
            }
          }
        }
        if (!isAborted) callbacks.onComplete();
      } catch (err) {
        if (!isAborted) {
          callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    startStream();

    return () => {
      isAborted = true;
      controller.abort();
    };
  },

  resumeAgentRun(runId: string, callbacks: StreamListener, abortSignal?: AbortSignal): () => void {
    return this.streamAgentRun('', '', callbacks, abortSignal, runId);
  },

  // --- Long-Term Memory ---
  async getMemories(params?: MemorySearchParams): Promise<Memory[]> {
    if (USE_MOCK) {
      let filtered = [...memoriesStore];
      if (params?.category && params.category !== 'all') {
        filtered = filtered.filter((m) => m.category === params.category);
      }
      if (params?.query) {
        const q = params.query.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            m.title.toLowerCase().includes(q) ||
            m.content.toLowerCase().includes(q) ||
            m.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return filtered;
    }
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set('query', params.query);
    if (params?.category) searchParams.set('category', params.category);
    const res = await apiFetch(`${API_BASE_URL}/memories?${searchParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch memories');
    return res.json();
  },

  async createMemory(memory: Partial<Memory>): Promise<Memory> {
    if (USE_MOCK) {
      const newMemory: Memory = {
        id: `mem_${Date.now()}`,
        category: memory.category || 'semantic',
        title: memory.title || 'Untitled Memory',
        content: memory.content || '',
        source: memory.source || 'user_manual',
        confidence: memory.confidence ?? 1.0,
        tags: memory.tags || ['manual'],
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pinned: memory.pinned || false,
        metadata: { verifiedByUser: true },
      };
      memoriesStore.unshift(newMemory);
      return newMemory;
    }
    const res = await apiFetch(`${API_BASE_URL}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memory),
    });
    if (!res.ok) throw new Error('Failed to create memory');
    return res.json();
  },

  async deleteMemory(memoryId: string): Promise<boolean> {
    if (USE_MOCK) {
      memoriesStore = memoriesStore.filter((m) => m.id !== memoryId);
      return true;
    }
    const res = await apiFetch(`${API_BASE_URL}/memories/${memoryId}`, { method: 'DELETE' });
    return res.ok;
  },

  async getMemorySuggestions(): Promise<MemorySuggestion[]> {
    if (USE_MOCK) return [];
    const res = await apiFetch(`${API_BASE_URL}/memory-suggestions`);
    if (!res.ok) throw new Error('Failed to fetch memory suggestions');
    return res.json();
  },

  async decideMemorySuggestion(suggestionId: string, payload: {
    decision: 'approve' | 'reject';
    title?: string;
    content?: string;
    category?: MemorySuggestion['category'];
    tags?: string[];
  }): Promise<{ status: 'approved' | 'rejected'; memory?: Memory }> {
    if (USE_MOCK) throw new Error('Memory review is unavailable in demo mode');
    const res = await apiFetch(`${API_BASE_URL}/memory-suggestions/${suggestionId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update memory suggestion');
    return res.json();
  },

  // --- Scheduled & Background Tasks ---
  async getTasks(): Promise<ScheduledTask[]> {
    if (USE_MOCK) return [...tasksStore];
    const res = await apiFetch(`${API_BASE_URL}/tasks`);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  },

  async createTask(payload: CreateTaskPayload): Promise<ScheduledTask> {
    if (USE_MOCK) {
      const newTask: ScheduledTask = {
        id: `task_${Date.now()}`,
        title: payload.title,
        description: payload.description,
        assignedAgentId: payload.assignedAgentId,
        assignedAgentName:
          MOCK_AGENTS.find((a) => a.id === payload.assignedAgentId)?.name || 'Nexus Supervisor',
        schedule: {
          type: payload.cronExpression ? 'cron' : 'interval',
          cronExpression: payload.cronExpression || '0 9 * * 1-5',
          intervalMinutes: payload.intervalMinutes,
          timezone: 'America/New_York',
          nextExecutionTime: new Date(Date.now() + 86400000).toISOString(),
        },
        status: 'scheduled',
        enabled: true,
        priority: payload.priority,
        requiresHumanApproval: payload.requiresHumanApproval,
        targetMcpServers: payload.targetMcpServers || ['mcp-gmail'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      tasksStore.unshift(newTask);
      return newTask;
    }
    const res = await apiFetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create task');
    return res.json();
  },

  async toggleTask(taskId: string, enabled: boolean): Promise<ScheduledTask | undefined> {
    if (USE_MOCK) {
      const task = tasksStore.find((t) => t.id === taskId);
      if (task) {
        task.enabled = enabled;
        task.status = enabled ? 'scheduled' : 'paused';
        task.updatedAt = new Date().toISOString();
      }
      return task;
    }
    const res = await apiFetch(`${API_BASE_URL}/tasks/${taskId}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('Failed to toggle task');
    return res.json();
  },

  async deleteTask(taskId: string): Promise<boolean> {
    if (USE_MOCK) {
      tasksStore = tasksStore.filter((t) => t.id !== taskId);
      return true;
    }
    const res = await apiFetch(`${API_BASE_URL}/tasks/${taskId}`, { method: 'DELETE' });
    return res.ok;
  },

  async runTaskNow(taskId: string): Promise<{ success: boolean; approvalRequired?: boolean; error?: string }> {
    const res = await apiFetch(`${API_BASE_URL}/tasks/${taskId}/run`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Could not run task');
    return res.json();
  },
  // --- Human Approval Center ---
  async getApprovals(): Promise<ApprovalRequest[]> {
    if (USE_MOCK) return [...approvalsStore];
    const res = await apiFetch(`${API_BASE_URL}/approvals`);
    if (!res.ok) throw new Error('Failed to fetch approvals');
    return res.json();
  },

  async submitApprovalDecision(payload: ApprovalDecisionPayload): Promise<ApprovalRequest> {
    if (USE_MOCK) {
      const approval = approvalsStore.find((a) => a.id === payload.requestId);
      if (approval) {
        approval.status = payload.decision === 'approve' ? 'approved' : 'rejected';
        approval.decidedAt = new Date().toISOString();
        approval.decidedBy = 'Alex Vance (Operator)';
        approval.decisionNotes = payload.notes || `Manually ${payload.decision}d via Console`;
      }
      return approval || approvalsStore[0];
    }
    const res = await apiFetch(`${API_BASE_URL}/approvals/${payload.requestId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to submit approval');
    return res.json();
  },

  // --- Connected Apps & Integrations ---
  async getIntegrations(): Promise<ConnectedApp[]> {
    if (USE_MOCK) return [...integrationsStore];
    const res = await apiFetch(`${API_BASE_URL}/integrations`);
    if (!res.ok) throw new Error('Failed to fetch integrations');
    return res.json();
  },

  async connectIntegration(appId: string): Promise<{ authUrl?: string; connected: boolean }> {
    if (USE_MOCK) {
      const app = integrationsStore.find((a) => a.id === appId);
      if (app) {
        app.status = app.status === 'connected' ? 'disconnected' : 'connected';
        app.lastSyncedAt = new Date().toISOString();
      }
      return { connected: true };
    }
    const res = await apiFetch(`${API_BASE_URL}/integrations/${appId}/connect`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Could not start Google connection');
    return res.json();
  },

  async disconnectIntegration(appId: string): Promise<void> {
    if (USE_MOCK) return;
    const res = await apiFetch(`${API_BASE_URL}/integrations/${appId}/disconnect`, { method: 'POST' });
    if (!res.ok) throw new Error('Could not disconnect Google');
  },

  async createTelegramLink(): Promise<{ code: string; command: string; expiresInSeconds: number }> {
    const res = await apiFetch(`${API_BASE_URL}/telegram/link`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Could not create a Telegram link code');
    return res.json();
  },

  async unlinkTelegram(): Promise<void> {
    const res = await apiFetch(`${API_BASE_URL}/telegram/link`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Could not unlink Telegram');
  },

  // --- Observability & Runs ---
  async getObservabilityRuns(): Promise<ObservabilityRun[]> {
    if (USE_MOCK) return [...MOCK_OBSERVABILITY_RUNS];
    const res = await apiFetch(`${API_BASE_URL}/observability/runs`);
    if (!res.ok) throw new Error('Failed to fetch runs');
    return res.json();
  },

  async getSystemHealth(): Promise<SystemHealthSummary> {
    if (USE_MOCK) return { ...MOCK_SYSTEM_HEALTH };
    const res = await apiFetch(`${API_BASE_URL}/observability/stats`);
    if (!res.ok) throw new Error('Failed to fetch health metrics');
    return res.json();
  },

  async getActivityRuns(): Promise<AgentRun[]> {
    if (USE_MOCK) return [];
    const res = await apiFetch(`${API_BASE_URL}/activity/runs`);
    if (!res.ok) throw new Error('Failed to fetch activity runs');
    return res.json();
  },
  // --- Settings ---
  async getSettings(): Promise<SystemSettings> {
    if (USE_MOCK) return { ...settingsStore };
    const res = await apiFetch(`${API_BASE_URL}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    if (USE_MOCK) {
      settingsStore = { ...settingsStore, ...settings };
      return settingsStore;
    }
    const res = await apiFetch(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  async getMcpServers(): Promise<MCPServer[]> {
    if (USE_MOCK) return [];
    const res = await apiFetch(`${API_BASE_URL}/mcp/servers`);
    if (!res.ok) throw new Error('Could not load MCP connectors');
    return res.json();
  },

  async saveMcpServer(payload: MCPServerInput, serverId?: string): Promise<MCPServer> {
    if (USE_MOCK) throw new Error('MCP connectors are unavailable in demo mode');
    const res = await apiFetch(serverId ? `${API_BASE_URL}/mcp/servers/${serverId}` : `${API_BASE_URL}/mcp/servers`, {
      method: serverId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || 'Could not save MCP connector');
    }
    return res.json();
  },

  async testMcpServer(serverId: string): Promise<MCPServerTestResult> {
    if (USE_MOCK) throw new Error('MCP connectors are unavailable in demo mode');
    const res = await apiFetch(`${API_BASE_URL}/mcp/servers/${serverId}/test`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || 'Could not connect to MCP server');
    }
    return res.json();
  },

  async deleteMcpServer(serverId: string): Promise<void> {
    if (USE_MOCK) throw new Error('MCP connectors are unavailable in demo mode');
    const res = await apiFetch(`${API_BASE_URL}/mcp/servers/${serverId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Could not delete MCP connector');
  },
};
