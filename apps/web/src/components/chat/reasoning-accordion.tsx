'use client';

import React, { useState } from 'react';
import { ExecutionSummaryStep } from '@/lib/api/types';
import { CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';

interface ReasoningAccordionProps {
  steps: ExecutionSummaryStep[];
  agentName?: string;
  isStreaming?: boolean;
}

export function ReasoningAccordion({
  steps,
  agentName = 'Nexus Supervisor',
  isStreaming = false,
}: ReasoningAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!steps || steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const isFinished = completedCount === steps.length && !isStreaming;

  return (
    <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm overflow-hidden text-xs">
      {/* Header bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-900/60 hover:bg-slate-800/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="font-semibold text-slate-200">{agentName} Execution Steps</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
            {completedCount}/{steps.length} completed
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          {isStreaming && (
            <span className="text-[11px] text-sky-400 animate-pulse font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
              Orchestrating...
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Steps Timeline Tree */}
      {isExpanded && (
        <div className="p-3.5 space-y-2 border-t border-slate-800/70 font-mono">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;
            const isStepCompleted = step.status === 'completed';
            const isStepActive = step.status === 'in_progress';
            const isStepFailed = step.status === 'failed';

            return (
              <div key={step.id || idx} className="flex items-start gap-2.5 relative">
                {/* Visual Tree Connector */}
                {!isLast && (
                  <span className="absolute left-[7px] top-[18px] bottom-[-8px] w-px bg-slate-800" />
                )}

                {/* Status Dot */}
                <div className="mt-0.5 shrink-0 z-10">
                  {isStepCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {isStepActive && <Clock className="w-3.5 h-3.5 text-sky-400 animate-spin" />}
                  {isStepFailed && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                  {!isStepCompleted && !isStepActive && !isStepFailed && (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-700 bg-slate-800 inline-block" />
                  )}
                </div>

                {/* Step Details */}
                <div className="flex-1 flex items-baseline justify-between min-w-0">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-xs tracking-tight truncate',
                        isStepActive ? 'text-sky-300 font-semibold' : 'text-slate-300'
                      )}
                    >
                      {step.title}
                    </p>
                    {step.description && (
                      <p className="text-[11px] text-slate-500">{step.description}</p>
                    )}
                  </div>
                  {step.durationMs && (
                    <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                      {formatDuration(step.durationMs)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
