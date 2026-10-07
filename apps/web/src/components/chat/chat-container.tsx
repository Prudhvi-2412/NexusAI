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
  MicOff,
  Activity,
  Plus,
  Sparkles,
  Command,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { toast } from '@/lib/hooks/use-toast';
import { MOCK_ACTIVE_RUN } from '@/lib/api/mock-data';
import { motion } from 'motion/react';
import { ArrowUp, Mail, Calendar, PenLine } from 'lucide-react';
import { Brand } from '@/components/layout/app-shell';

export function ChatContainer() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognitionAvailable, setSpeechRecognitionAvailable] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeRun, setActiveRun] = useState<AgentRun | null>(
    process.env.NEXT_PUBLIC_USE_MOCK_API === 'false' ? null : MOCK_ACTIVE_RUN
  );
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations and initial messages
  useEffect(() => {
    api.getConversations()
      .then(async (convs) => {
        const available = convs.length ? convs : [await api.createConversation('New Agent Session')];
        setConversations(available);
        setActiveConvId(available[0].id);
      })
      .catch(() => { setIsLoadingMessages(false); setLoadError(true); });
  }, []);

  useEffect(() => {
    let current = true;
    if (activeConvId) {
      setIsLoadingMessages(true);
      api.getMessages(activeConvId).then((msgs) => {
        if(current) setMessages(msgs);
      }).catch(() => toast({title:'Could not load this conversation',description:'Try selecting the conversation again.'}))
        .finally(() => {if(current) setIsLoadingMessages(false);});
    }
    return () => { current = false; };
  }, [activeConvId]);

  useEffect(() => {
    const speechWindow = window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    setSpeechRecognitionAvailable(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'end' });
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
    let runFailed = false;
    let runPaused = false;
    api.streamAgentRun(
      text,
      activeConvId,
      {
        onEvent: (event) => {
          if (event.type === 'agent:handoff') {
            const handoff = event.data as any;
            setActiveRun((prev) => prev ? {
              ...prev,
              steps: [...prev.steps, {
                id: `handoff_${prev.steps.length}`,
                name: 'Agent handoff',
                type: 'delegation',
                agentName: handoff.toAgent || 'Nexus Supervisor',
                summary: `${handoff.fromAgent || 'Nexus Supervisor'} → ${handoff.toAgent || 'Nexus Supervisor'}: ${handoff.reason || 'Continue the request'}`,
                status: 'completed',
                startedAt: new Date().toISOString(),
              }],
            } : null);
          } else if (event.type === 'step:start') {
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
          } else if (event.type === 'approval:required') {
            const approval = event.data as { approvalRequestId?: string };
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId
              ? { ...m, approvalRequestId: approval.approvalRequestId }
              : m));
          } else if (event.type === 'memory:suggestions') {
            const memoryEvent = event.data as { count?: number };
            toast({
              title: `${memoryEvent.count || 1} memory suggestion${memoryEvent.count === 1 ? '' : 's'} ready to review`,
              description: 'Open Memory to edit, save, or dismiss them. Nothing was saved automatically.',
              variant: 'default',
            });
          } else if (event.type === 'run:paused') {
            runPaused = true;
            setActiveRun((prev) => prev ? { ...prev, status: 'paused' } : null);
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId
              ? { ...m, executionSummary: (m.executionSummary || []).map((step) => step.status === 'in_progress' ? { ...step, status: 'pending' as const, description: 'Waiting for your approval' } : step) }
              : m));
            setIsStreaming(false);
          } else if (event.type === 'run:error') {
            runFailed = true;
            setActiveRun(prev => prev ? {...prev,status:'failed'} : null);
            const runData = event.data as { error?: string };
            setIsStreaming(false);
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId
              ? { ...m, isStreaming: false, content: runData.error || 'The request failed.' }
              : m));
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
          runFailed = true;
          setActiveRun(prev => prev ? {...prev,status:'failed'} : null);
          setIsStreaming(false);
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? {...m,isStreaming:false,content:m.content || 'The response was interrupted. Please try again.'} : m));
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
                      status: runFailed || runPaused ? s.status : 'completed' as const,
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
    setMessages(prev => prev.map(m => m.isStreaming ? {...m,isStreaming:false,content:m.content || 'Response stopped.'} : m));
    toast({
      title: 'Response stopped',
      description: 'You can send another message when you’re ready.',
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

  const handleVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const speechWindow = window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast({ title: 'Voice input isn’t supported here', description: 'Try a browser with Web Speech recognition, or type your request.', variant: 'info' });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => {
      window.speechSynthesis?.cancel();
      setIsListening(true);
    };
    recognition.onresult = (event: any) => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const part = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal && part.trim()) {
          setInputValue(current => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${part.trim()}`);
        }
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast({ title: 'Microphone access is blocked', description: 'Allow microphone access for this site in your browser, then try again.', variant: 'destructive' });
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast({ title: 'Could not recognize speech', description: 'Try again or type your request.', variant: 'destructive' });
      }
    };
    recognition.onend = () => { recognitionRef.current = null; setIsListening(false); };
    recognitionRef.current = recognition;
    try { recognition.start(); }
    catch { recognitionRef.current = null; setIsListening(false); toast({ title: 'Voice input could not start', description: 'Try again or type your request.', variant: 'destructive' }); }
  };

  const executivePresets = [
    { title: 'Clear my inbox', detail: 'Summarize my unread emails', prompt: 'Summarize my unread emails and highlight what needs my attention.', icon: Mail },
    { title: 'Make room for today', detail: 'See what is on my calendar', prompt: 'What meetings are on my calendar today? Help me prepare.', icon: Calendar },
    { title: 'Draft an email', detail: 'Write a message for me to review', prompt: 'Help me draft an email. First ask me for the recipient, purpose, and tone if I have not provided them. Then give me a subject and email body that I can review and copy. Do not send it.', icon: PenLine },
    { title: 'Find a little clarity', detail: 'Turn ideas into a plan', prompt: 'Help me plan my priorities for today. Ask me what I need to accomplish.', icon: Sparkles },
  ];
  return (
    <div className="chat-workspace flex overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <div className="px-4 md:px-8 flex items-center justify-between gap-2 h-12 shrink-0">
          <select aria-label="Conversation" value={activeConvId} disabled={isStreaming} onChange={e => setActiveConvId(e.target.value)} className="bg-transparent rounded-lg text-xs text-slate-400 max-w-[180px] sm:max-w-[280px] p-2 truncate">
            {conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={isStreaming} onClick={handleNewConversation} aria-label="New conversation"><Plus size={16} /><span className="hidden sm:inline">New chat</span></Button>
            <Button variant="ghost" size="sm" onClick={() => setIsActivityOpen(!isActivityOpen)} aria-label="Toggle activity panel" aria-expanded={isActivityOpen}><Activity size={16} /><span className="hidden sm:inline">Activity</span></Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-3 sm:py-6 min-h-0">
          {loadError ? <div role="alert" className="max-w-md mx-auto py-12 text-center"><h2 className="text-lg">Your workspace couldn’t be loaded.</h2><p className="text-sm text-slate-400 mt-2">Check that the local API is running, then try again.</p><Button className="mt-5" onClick={() => window.location.reload()}>Try again</Button></div> : isLoadingMessages ? <div role="status" aria-label="Loading conversation" className="max-w-[760px] mx-auto space-y-5 py-10"><div className="h-5 w-1/3 bg-white/5 rounded animate-pulse" /><div className="h-20 w-3/4 bg-white/5 rounded-2xl animate-pulse" /></div> : messages.length === 0 ? (
            <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.4}} className="max-w-[760px] mx-auto flex flex-col items-center justify-center min-h-full py-0 sm:py-12">
              <motion.div initial={{opacity:0,scale:.9,filter:'blur(4px)'}} animate={{opacity:1,scale:1,filter:'blur(0px)'}} transition={{duration:.6}} className="nexus-clay w-16 h-16 sm:w-20 sm:h-20 rounded-[24px] flex items-center justify-center mb-4 sm:mb-8"><Brand size={48} /></motion.div>
              <span className="hidden sm:block text-[11px] uppercase tracking-[.2em] text-slate-500 mb-4">A little more headspace</span>
              <h1 className="text-[30px] sm:text-[44px] font-medium tracking-[-.045em] text-center leading-tight">What can I take off<br className="sm:hidden" /> your mind?</h1>
              <p className="text-sm sm:text-base text-slate-400 text-center mt-4 max-w-md leading-relaxed">Bring your email, calendar, and ideas together.<br className="hidden sm:block" /> Let’s make space for what matters.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 mt-6 sm:mt-10 w-full">
                {executivePresets.map(preset => <button key={preset.title} disabled={!activeConvId} onClick={() => handleSendMessage(preset.prompt)} className="nexus-card group grid grid-cols-[24px_1fr] gap-3 sm:block text-left rounded-2xl border border-white/[.07] bg-[#262626] hover:bg-[#2e2e2e] hover:border-white/15 p-4 sm:p-5 transition-all active:scale-[.98] disabled:opacity-50">
                  <preset.icon size={20} strokeWidth={1.7} className="text-slate-400 sm:mb-4" /><span><span className="text-sm font-medium block">{preset.title}</span><span className="text-xs text-slate-400 mt-1 sm:mt-2 block leading-relaxed">{preset.detail}</span></span>
                </button>)}
              </div>
            </motion.div>
          ) : messages.map(m => <MessageBubble key={m.id} message={m} />)}
          <div ref={messagesEndRef} />
        </div>
        <div className="px-4 sm:px-8 pb-4 sm:pb-6 pt-2 shrink-0">
          <div className="max-w-[760px] mx-auto">
            <div className="rounded-[24px] bg-[#303030] border border-white/[.08] shadow-[0_8px_32px_#00000012] focus-within:border-white/25 transition-colors">
              <textarea aria-label="Message NexusAI" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSendMessage(); } }} placeholder="Ask anything, or start with your day…" rows={2} className="w-full bg-transparent px-5 pt-4 pb-2 text-[16px] sm:text-[15px] placeholder:text-slate-500 resize-none focus:outline-none focus-visible:outline-none" />
              <div className="px-3 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button type="button" size="icon" variant="ghost" onClick={handleVoiceInput} disabled={isStreaming} aria-label={isListening ? 'Stop voice input' : 'Start voice input'} aria-pressed={isListening} title={!speechRecognitionAvailable ? 'Voice input is not supported in this browser' : isListening ? 'Stop listening' : 'Speak a message'} className={isListening ? 'text-primary animate-pulse' : 'text-slate-400'}><span className="relative flex"><span aria-hidden="true" className={isListening ? 'absolute inset-0 rounded-full bg-sky-400/20 animate-ping' : 'hidden'} /><span className="relative">{isListening ? <MicOff size={17} /> : <Mic size={17} />}</span></span></Button>
                  {isListening && <span role="status" aria-live="polite" className="text-xs text-sky-300">Listening… speak now</span>}
                  <span className="text-xs text-slate-400 flex items-center gap-2"><Sparkles size={14} />Gemini<span className="hidden sm:inline text-slate-600 ml-3">Shift + Enter for a new line</span></span>
                </div>
                {isStreaming ? <Button size="icon" variant="secondary" onClick={handleStopExecution} aria-label="Stop response" className="rounded-full"><Square size={14} fill="currentColor" /></Button> : <Button size="icon" onClick={() => handleSendMessage()} disabled={!inputValue.trim() || !activeConvId} aria-label="Send message" className="rounded-full"><ArrowUp size={18} /></Button>}
              </div>
            </div>
            <p className="text-center text-[11px] text-slate-500 mt-3">NexusAI can make mistakes. Review important details.</p>
          </div>
        </div>
      </div>
      <ActivityDrawer run={activeRun} isOpen={isActivityOpen} onToggle={() => setIsActivityOpen(!isActivityOpen)} />
    </div>
  );
}
