'use client';

import React from 'react';
import { Message } from '@/lib/api/types';
import { ToolCallBadge } from './tool-call-badge';
import { ReasoningAccordion } from './reasoning-accordion';
import { Bot, User, ShieldAlert, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

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

  // Basic formatted Markdown renderer for paragraphs and lists.
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-sm font-semibold text-slate-100 mt-3 mb-1">
            {renderInline(line.replace('### ', ''))}
          </h4>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="ml-4 list-disc text-slate-300 text-xs sm:text-sm my-0.5">
            {renderInline(line.replace(/^[-*]\s+/, ''))}
          </li>
        );
      }
      if (/^\d+\.\s/.test(line)) {
        return (
          <li key={idx} className="ml-4 list-decimal text-slate-300 text-xs sm:text-sm my-0.5">
            {renderInline(line.replace(/^\d+\.\s+/, ''))}
          </li>
        );
      }
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p key={idx} className="text-xs sm:text-sm text-slate-200 leading-relaxed my-1">
          {renderInline(line)}
        </p>
      );
    });
  };

  return (
    <div
      className={cn(
        'flex gap-3 max-w-4xl w-full mx-auto py-3 animate-fade-in',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-sky-500/10 text-white mt-0.5">
          <Bot className="w-4 h-4" />
        </div>
      )}

      {/* Bubble Container */}
      <div
        className={cn(
          'flex flex-col max-w-[85%] rounded-2xl p-4 transition-all',
          isUser
            ? 'bg-sky-600 text-white shadow-md shadow-sky-600/15 rounded-tr-sm ml-auto'
            : 'bg-slate-900/90 border border-slate-800/90 shadow-lg shadow-black/20 rounded-tl-sm'
        )}
      >
        {/* Header line for Assistant */}
        {!isUser && (
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-sky-400">
                {message.agentName || 'Nexus Supervisor'}
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
        <div className="prose prose-invert prose-sm max-w-none break-words">
          {renderFormattedContent(message.content)}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-sky-400 animate-pulse align-middle" />
          )}
        </div>

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
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
