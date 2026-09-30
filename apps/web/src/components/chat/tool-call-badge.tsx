'use client';

import React, { useState } from 'react';
import { ToolCall } from '@/lib/api/types';
import { Terminal, CheckCircle2, AlertCircle, Clock, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';

export function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'executing':
        return <Clock className="w-3.5 h-3.5 text-sky-400 animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'failed':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'requires_approval':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="my-1.5 rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/50 transition-colors text-left font-mono"
      >
        <div className="flex items-center gap-2 min-w-0">
          {getStatusIcon()}
          <span className="font-semibold text-slate-200">{toolCall.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {toolCall.server}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-slate-400">
          <span>{formatDuration(toolCall.durationMs)}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-xs font-mono space-y-2">
          <div>
            <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Tool Input Payload</div>
            <pre className="p-2 rounded bg-slate-900 text-sky-300 overflow-x-auto text-[11px]">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.error && (
            <div>
              <div className="text-[10px] uppercase text-rose-500 font-semibold mb-1">Execution Error</div>
              <pre className="p-2 rounded bg-rose-950/40 border border-rose-500/20 text-rose-300 overflow-x-auto text-[11px]">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
