'use client';

import React, { useEffect, useState } from 'react';
import { Message } from '@/lib/api/types';
import { ToolCallBadge } from './tool-call-badge';
import { ReasoningAccordion } from './reasoning-accordion';
import { Bot, User, ShieldAlert, ArrowRight, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Copy, Check } from 'lucide-react';
import { Brand } from '@/components/layout/app-shell';
import { toast } from '@/lib/hooks/use-toast';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (speaking) window.speechSynthesis?.cancel(); }, [speaking]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { toast({title:'Could not copy', description:'Select the response text to copy it.'}); }
  };
  const speak = () => {
    if (!('speechSynthesis' in window)) {
      toast({ title: 'Spoken replies aren’t supported here', description: 'Your browser does not provide speech playback.', variant: 'info' });
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const spokenText = message.content.slice(0, 12000)
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/`([^`]*)`/g, '$1');
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = navigator.language || 'en-US';
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // Render the small, safe subset of Markdown used by assistant summaries.
  const renderInline = (value: string) => {
    const normalized = value.replace(/\\([\\`*_])/g, '$1');
    return normalized.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index} className="rounded bg-slate-800 px-1 py-0.5 text-sky-200">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    const output: React.ReactNode[] = [];
    let index = 0;
    while(index < lines.length) {
      const line = lines[index];
      if(line.startsWith('```')) {
        const code: string[] = []; const key = index++;
        while(index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
        index++;
        output.push(<pre key={key} className="my-4 overflow-x-auto rounded-xl bg-[#292929] p-4 text-sm"><code>{code.join('\n')}</code></pre>);
        continue;
      }
      if(/^\s*([-*] |\d+\. )/.test(line)) {
        const ordered = /^\s*\d+\./.test(line); const items: React.ReactNode[] = []; const key=index;
        const pattern = ordered ? /^\s*\d+\.\s/ : /^\s*[-*]\s/;
        while(index < lines.length && pattern.test(lines[index])) {
          items.push(<li key={index} className="pl-1 my-2">{renderInline(lines[index].replace(pattern,''))}</li>); index++;
        }
        output.push(ordered ? <ol key={key} className="list-decimal pl-5 my-3 space-y-2">{items}</ol> : <ul key={key} className="list-disc pl-5 my-3 space-y-2">{items}</ul>);
        continue;
      }
      if(/^#{1,3} /.test(line)) output.push(<h3 key={index} className="font-semibold text-lg mt-6 mb-2">{renderInline(line.replace(/^#{1,3} /,''))}</h3>);
      else if(line.trim()) output.push(<p key={index} className="my-2 text-slate-200">{renderInline(line)}</p>);
      else output.push(<div key={index} className="h-2"/>);
      index++;
    }
    return output;
  };

  return (
    <div
      className={cn(
        'flex gap-3 max-w-[760px] w-full mx-auto py-5 animate-fade-in',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="w-7 h-7 flex items-center justify-center shrink-0 mt-1">
          <Brand size={24} />
        </div>
      )}

      {/* Bubble Container */}
      <div
        className={cn(
          'flex flex-col min-w-0 rounded-2xl transition-all',
          isUser
            ? 'bg-[#303030] text-white px-5 py-3 max-w-[85%] ml-auto'
            : 'flex-1 py-1'
        )}
      >
        {/* Header line for Assistant */}
        {!isUser && (
          <div className="flex items-center justify-between pb-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-sky-400">
                NexusAI
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {message.isStreaming && (
              <span className="flex items-center gap-1.5 text-[10px] text-sky-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
                Generating
              </span>
            )}
          </div>
        )}

        {/* Safe Execution Summary Accordion (Without exposing raw chain-of-thought) */}
        {!isUser && message.executionSummary && message.executionSummary.length > 0 && (
          <ReasoningAccordion
            steps={message.executionSummary}
            agentName={message.agentName}
            isStreaming={message.isStreaming}
          />
        )}

        {/* Message Content Body */}
        <div className="chat-copy max-w-none break-words">
          {renderFormattedContent(message.content)}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-sky-400 animate-pulse align-middle" />
          )}
        </div>
        {!isUser && !message.isStreaming && message.content && <div className="flex items-center gap-1 self-start mt-3"><button onClick={copy} aria-label={copied ? 'Response copied' : 'Copy response'} className="p-2 -ml-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5">{copied ? <Check size={16} /> : <Copy size={16} />}</button><button onClick={speak} aria-label={speaking ? 'Stop speaking response' : 'Read response aloud'} aria-pressed={speaking} title={speaking ? 'Stop speaking' : 'Read aloud'} className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5">{speaking ? <VolumeX size={16} /> : <Volume2 size={16} />}</button></div>}

        {/* Tool Calls */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-800/60">
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold mb-1">
              Tool Activity ({message.toolCalls.length})
            </p>
            <div className="space-y-1">
              {message.toolCalls.map((tc) => (
                <ToolCallBadge key={tc.id} toolCall={tc} />
              ))}
            </div>
          </div>
        )}

        {/* Human Approval Required Callout */}
        {message.approvalRequestId && (
          <div className="mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Action staged & awaiting your approval</span>
            </div>
            <Link
              href="/approvals"
              className="flex items-center gap-1 font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2 shrink-0 ml-2"
            >
              <span>Review in Approval Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* User Avatar */}
      {false && isUser && (
        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
