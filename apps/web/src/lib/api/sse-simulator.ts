import { ExecutionEvent, ToolCall } from './types';

export interface StreamListener {
  onEvent: (event: ExecutionEvent) => void;
  onChunk: (chunk: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

/**
 * Simulates a realistic LangGraph SSE stream with step transitions,
 * tool execution events, streaming response tokens, and approval points.
 */
export function simulateAgentStream(
  message: string,
  callbacks: StreamListener,
  abortSignal?: AbortSignal
): () => void {
  let isCancelled = false;
  const runId = `run_${Math.random().toString(36).substring(2, 9)}`;

  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      isCancelled = true;
    });
  }

  const delay = (ms: number) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => clearTimeout(timer));
      }
    });

  async function runSimulation() {
    try {
      if (isCancelled) return;

      // 1. Run Init
      callbacks.onEvent({
        runId,
        type: 'run:init',
        timestamp: new Date().toISOString(),
        data: {
          agentName: 'Nexus Supervisor',
          taskTitle: `Execute: "${message.substring(0, 42)}..."`,
          status: 'running',
        },
      });

      await delay(400);
      if (isCancelled) return;

      // 2. Step: Understanding & Intent Decomposition
      callbacks.onEvent({
        runId,
        type: 'step:start',
        timestamp: new Date().toISOString(),
        data: {
          stepId: 'step_1',
          name: 'Intent Decomposition',
          agentName: 'Nexus Supervisor',
          summary: 'Analyzing executive goal and determining required MCP servers',
          status: 'active',
        },
      });

      await delay(600);
      if (isCancelled) return;

      callbacks.onEvent({
        runId,
        type: 'step:complete',
        timestamp: new Date().toISOString(),
        data: {
          stepId: 'step_1',
          status: 'completed',
          summary: 'Identified target services: Google Calendar and Gmail Comms',
          durationMs: 580,
        },
      });

      // 3. Step: Memory & Preferences Lookup
      callbacks.onEvent({
        runId,
        type: 'step:start',
        timestamp: new Date().toISOString(),
        data: {
          stepId: 'step_2',
          name: 'pgvector Memory Retrieval',
          agentName: 'MemoryCurator',
          summary: 'Querying preferences: meeting buffers and executive contacts',
          status: 'active',
        },
      });

      await delay(500);
      if (isCancelled) return;

      callbacks.onEvent({
        runId,
        type: 'step:complete',
        timestamp: new Date().toISOString(),
        data: {
          stepId: 'step_2',
          status: 'completed',
          summary: 'Loaded rule: "15-minute buffer between meetings" & VIP Sarah Jenkins',
          durationMs: 480,
        },
      });

      // 4. Tool Execution: MCP Tool Call
      const toolCall: ToolCall = {
        id: `tc_${Math.random().toString(36).substring(2, 7)}`,
        name: 'calendar_check_availability',
        server: 'mcp-calendar',
        input: { window: '2026-10-02T13:00/18:00', durationMinutes: 45 },
        status: 'executing',
        startedAt: new Date().toISOString(),
      };

      callbacks.onEvent({
        runId,
        type: 'tool:start',
        timestamp: new Date().toISOString(),
        data: { toolCall },
      });

      await delay(800);
      if (isCancelled) return;

      callbacks.onEvent({
        runId,
        type: 'tool:end',
        timestamp: new Date().toISOString(),
        data: {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: { freeSlotFound: true, start: '14:30', end: '15:15', conflicts: 0 },
          status: 'success',
          durationMs: 780,
        },
      });

      // 5. Stream Tokens
      const responseParagraphs = [
        "I've processed your request using the Google Calendar and Comms agents.\n\n",
        "**Action Summary:**\n",
        "- Checked your calendar for the requested window.\n",
        "- Verified no schedule overlap and preserved your 15-minute buffer requirement.\n",
        "- Staged an invite update for **Friday, 2:30 PM - 3:15 PM** with all primary participants.\n\n",
        "Would you like me to dispatch the calendar invites and notify the team via Telegram?",
      ];

      for (const paragraph of responseParagraphs) {
        if (isCancelled) return;
        const words = paragraph.split(' ');
        for (const word of words) {
          if (isCancelled) return;
          callbacks.onChunk(word + ' ');
          await delay(35);
        }
      }

      // 6. Complete
      callbacks.onEvent({
        runId,
        type: 'run:complete',
        timestamp: new Date().toISOString(),
        data: {
          runId,
          status: 'completed',
          durationMs: 3850,
          tokenUsage: {
            promptTokens: 1450,
            completionTokens: 210,
            totalTokens: 1660,
            estimatedCostUsd: 0.0068,
          },
        },
      });

      callbacks.onComplete();
    } catch (err) {
      if (!isCancelled) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  runSimulation();

  return () => {
    isCancelled = true;
  };
}
