'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, AgentRun, ActivityStep } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { MessageBubble } from './message-bubble';
import { ActivityDrawer } from './activity-drawer';
import { Button } from '@/components/shared/button';
import {
  Send,
  Square,
  Mic,
  Activity,
  Plus,
  Sparkles,
  Command,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { toast } from '@/lib/hooks/use-toast';
import { MOCK_ACTIVE_RUN } from '@/lib/api/mock-data';

export function ChatContainer() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRun, setActiveRun] = useState<AgentRun | null>(
    process.env.NEXT_PUBLIC_USE_MOCK_API === 'false' ? null : MOCK_ACTIVE_RUN
  );
  const [isActivityOpen, setIsActivityOpen] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations and initial messages
  useEffect(() => {
    api.getConversations()
      .then(async (convs) => {
        const available = convs.length ? convs : [await api.createConversation('New Agent Session')];
        setConversations(available);
        setActiveConvId(available[0].id);
      })
      .catch((error) => toast({ title: 'Could not load conversations', description: String(error), variant: 'destructive' }));
  }, []);

  useEffect(() => {
    if (activeConvId) {
      api.getMessages(activeConvId).then((msgs) => {
        setMessages(msgs);
      });
    }
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputValue;
    if (!text.trim() || isStreaming || !activeConvId) return;

    setInputValue('');

    // 1. Add User Message
    const userMsg: Message = {
      id: `msg_u_${Date.now()}`,
      conversationId: activeConvId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    // The real streaming endpoint persists the user turn atomically with the run.
    if (process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false') await api.addMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);

    // 2. Setup Assistant Streaming Placeholder
    const assistantMsgId = `msg_a_${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      conversationId: activeConvId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      agentName: 'Nexus Supervisor',
      isStreaming: true,
      executionSummary: [
        {
          id: 'step_init',
          title: 'Understanding request & decomposing subgoals',
          status: 'in_progress',
          timestamp: new Date().toISOString(),
        },
      ],
      toolCalls: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsStreaming(true);

    // Setup active run tracking
    const liveRun: AgentRun = {
      id: `run_${Date.now()}`,
      conversationId: activeConvId,
      agentId: 'agent_supervisor',
      agentName: 'Nexus Supervisor',
      taskTitle: text.length > 50 ? `${text.substring(0, 48)}...` : text,
      status: 'running',
      startedAt: new Date().toISOString(),
      currentStepIndex: 0,
      steps: [
        {
          id: 's1',
          name: 'Decomposing Goal',
          type: 'planning',
          agentName: 'Supervisor',
          summary: 'Analyzing intent and checking required MCP servers',
          status: 'active',
          startedAt: new Date().toISOString(),
        },
      ],
    };
    setActiveRun(liveRun);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // 3. Initiate Streaming Call
    api.streamAgentRun(
      text,
      activeConvId,
      {
        onEvent: (event) => {
          if (event.type === 'step:start') {
            const stepData = event.data as any;
            const newStep: ActivityStep = {
              id: stepData.stepId || `s_${Date.now()}`,
              name: stepData.name || 'Agent Execution',
              type: stepData.type || 'tool_execution',
              agentName: stepData.agentName || 'Supervisor',
              summary: stepData.summary || '',
              status: 'active',
              startedAt: new Date().toISOString(),
            };
            setActiveRun((prev) =>
              prev ? { ...prev, steps: [...prev.steps, newStep] } : null
            );

            // Also update safe message accordion
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      executionSummary: [
                        ...(m.executionSummary || []),
                        {
                          id: newStep.id,
                          title: newStep.name,
                          description: newStep.summary,
                          status: 'in_progress',
                          timestamp: new Date().toISOString(),
                        },
                      ],
                    }
                  : m
              )
            );
          } else if (event.type === 'step:complete') {
            const stepData = event.data as any;
            setActiveRun((prev) => {
              if (!prev) return null;
              const updatedSteps = prev.steps.map((s) =>
                s.id === stepData.stepId
                  ? {
                      ...s,
                      status: 'completed' as const,
                      summary: stepData.summary || s.summary,
                      durationMs: stepData.durationMs,
                    }
                  : s
              );
              return { ...prev, steps: updatedSteps };
            });

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      executionSummary: (m.executionSummary || []).map((s) =>
                        s.id === stepData.stepId
                          ? { ...s, status: 'completed' as const, durationMs: stepData.durationMs }
                          : s
                      ),
                    }
                  : m
              )
            );
          } else if (event.type === 'tool:start') {
            const toolData = event.data as any;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      toolCalls: [...(m.toolCalls || []), toolData.toolCall],
                    }
                  : m
              )
            );
          } else if (event.type === 'tool:end') {
            const toolData = event.data as any;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls || []).map((tc) =>
                        tc.id === toolData.toolCallId
                          ? { ...tc, status: toolData.status, durationMs: toolData.durationMs }
                          : tc
                      ),
                    }
                  : m
              )
            );
          } else if (event.type === 'run:error') {
            const runData = event.data as { error?: string };
            setIsStreaming(false);
            toast({ title: 'Gemini request failed', description: runData.error || 'Unknown error', variant: 'destructive' });
          } else if (event.type === 'run:complete') {
            const runData = event.data as any;
            setActiveRun((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'completed',
                    durationMs: runData.durationMs,
                    tokenUsage: runData.tokenUsage,
                  }
                : null
            );
          }
        },
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + chunk }
                : m
            )
          );
        },
        onError: (err) => {
          setIsStreaming(false);
          toast({
            title: 'Agent Execution Paused',
            description: err.message,
            variant: 'destructive',
          });
        },
        onComplete: () => {
          setIsStreaming(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    executionSummary: (m.executionSummary || []).map((s) => ({
                      ...s,
                      status: 'completed' as const,
                    })),
                  }
                : m
            )
          );
        },
      },
      abortController.signal
    );
  };

  const handleStopExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    toast({
      title: 'Execution Cancelled',
      description: 'The operator manually halted active agent subtasks.',
      variant: 'default',
    });
  };

  const handleNewConversation = async () => {
    const newConv = await api.createConversation('New Executive Session');
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    setMessages([]);
    setActiveRun(null);
  };

  const handleVoiceInputPlaceholder = () => {
    toast({
      title: 'Voice Input Initialized',
      description: 'Voice stream capture interface is ready for WebRTC backend connection.',
      variant: 'info',
    });
  };

  const executivePresets = process.env.NEXT_PUBLIC_USE_MOCK_API === 'false'
    ? [
        'Help me plan my priorities for today',
        'Draft a concise follow-up email for a meeting',
        'Help me prepare an agenda for a planning session',
      ]
    : [
        'Check unread emails from Sarah and audit Friday availability',
        'Generate daily morning executive briefing across Calendar & Gmail',
        'Review competitor pricing updates via Playwright browser',
      ];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Center Console */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Sub-bar: Session picker & Controls */}
        <div className="h-12 px-6 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={activeConvId}
              onChange={(e) => setActiveConvId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
            >
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className="text-xs text-slate-400 hover:text-white"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Session
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isActivityOpen ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIsActivityOpen(!isActivityOpen)}
              className="text-xs"
            >
              <Activity className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
              <span>Activity Panel</span>
            </Button>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-12 text-center space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center mx-auto shadow-xl shadow-sky-500/20 text-white">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Welcome to NexusAI Chief of Staff
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Gemini-powered assistant with saved conversations. Gmail, Calendar, Telegram,
                  browser actions, and approvals are still preview features.
                </p>
              </div>

              {/* Quick Prompt Starters */}
              <div className="space-y-2 pt-4 max-w-lg mx-auto">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold font-mono">
                  Suggested Prompts
                </div>
                {executivePresets.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(preset)}
                    className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 hover:border-slate-700 transition-all text-xs text-slate-300 flex items-center justify-between group"
                  >
                    <span>{preset}</span>
                    <Sparkles className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 backdrop-blur-md">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="relative rounded-2xl border border-slate-700/80 bg-slate-900/80 shadow-2xl focus-within:border-sky-500/80 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask NexusAI to plan, draft, or explain something..."
                rows={2}
                className="w-full bg-transparent px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 resize-none focus:outline-none"
              />

              <div className="px-3 pb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={handleVoiceInputPlaceholder}
                    title="Voice input placeholder"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition-colors"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">Enter</kbd> to run
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isStreaming ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleStopExecution}
                      className="text-xs"
                    >
                      <Square className="w-3.5 h-3.5 mr-1 fill-current" />
                      Stop Execution
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleSendMessage()}
                      disabled={!inputValue.trim()}
                      className="text-xs"
                    >
                      <span>Execute</span>
                      <Send className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Activity Panel */}
      <ActivityDrawer
        run={activeRun}
        isOpen={isActivityOpen}
        onToggle={() => setIsActivityOpen(!isActivityOpen)}
      />
    </div>
  );
}
