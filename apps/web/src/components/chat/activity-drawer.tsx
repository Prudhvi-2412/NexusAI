'use client';

import React from 'react';
import { AgentRun } from '@/lib/api/types';
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldAlert,
  Terminal,
  Cpu,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/shared/badge';
import { formatDuration } from '@/lib/utils';

interface ActivityDrawerProps {
  run: AgentRun | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function ActivityDrawer({ run, isOpen, onToggle }: ActivityDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="w-80 lg:w-96 shrink-0 border-l border-slate-800/80 bg-slate-950/80 backdrop-blur-xl flex flex-col h-full overflow-hidden text-xs">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <h3 className="font-semibold text-slate-100 tracking-tight">Agent Activity Panel</h3>
        </div>
        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800 text-[11px]"
        >
          Close
        </button>
      </div>

      {run ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
          {/* Active Run Card */}
          <div className="p-3.5 rounded-xl border border-sky-500/20 bg-sky-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-sky-400 font-semibold tracking-wider">
                Current Execution
              </span>
              <Badge variant={run.status === 'running' ? 'info' : 'success'} size="sm">
                {run.status.toUpperCase()}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-100 font-sans tracking-tight">
                {run.taskTitle}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>Lead: {run.agentName}</span>
              </div>
            </div>

            {/* Token & Metric Highlights */}
            {run.tokenUsage && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  {run.tokenUsage.totalTokens.toLocaleString()} tokens
                </span>
                <span>Est: ${(run.tokenUsage.estimatedCostUsd).toFixed(4)}</span>
              </div>
            )}
          </div>

          {/* Timeline of Tool Calls & Safe Summaries */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Execution Tree
            </div>

            <div className="space-y-2">
              {run.steps.map((step, idx) => {
                const isLast = idx === run.steps.length - 1;
                const isCompleted = step.status === 'completed';
                const isActive = step.status === 'active';
                const isFailed = step.status === 'failed';

                return (
                  <div key={step.id || idx} className="relative flex items-start gap-2.5 pb-2">
                    {/* Visual connector */}
                    {!isLast && (
                      <span className="absolute left-[7px] top-[18px] bottom-0 w-px bg-slate-800" />
                    )}

                    {/* Status icon */}
                    <div className="mt-0.5 shrink-0 z-10">
                      {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      {isActive && <Clock className="w-3.5 h-3.5 text-sky-400 animate-spin" />}
                      {isFailed && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                      {!isCompleted && !isActive && !isFailed && (
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-700 bg-slate-900 inline-block" />
                      )}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 min-w-0 bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-slate-200 truncate">{step.name}</span>
                        {step.durationMs && (
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {formatDuration(step.durationMs)}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                        {step.summary}
                      </p>

                      {/* Tool Call Sub-badge */}
                      {step.toolCall && (
                        <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-sky-400">
                          <span className="flex items-center gap-1 truncate">
                            <Terminal className="w-3 h-3 shrink-0" />
                            {step.toolCall.name}
                          </span>
                          <span className="text-slate-500 font-mono shrink-0">
                            {step.toolCall.server}
                          </span>
                        </div>
                      )}

                      {/* Human Approval Callout */}
                      {step.type === 'approval_wait' && (
                        <div className="mt-2 p-1.5 rounded bg-amber-950/40 border border-amber-500/20 text-amber-300 flex items-center gap-1.5 text-[10px]">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          <span>Waiting for human approval</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
          <Activity className="w-8 h-8 text-slate-700 mb-2" />
          <p className="font-medium text-slate-400">No Active Agent Execution</p>
          <p className="text-[11px] mt-1 text-slate-500 max-w-xs">
            Send a prompt in the console to initiate multi-agent planning and live tool telemetry.
          </p>
        </div>
      )}
    </div>
  );
}
