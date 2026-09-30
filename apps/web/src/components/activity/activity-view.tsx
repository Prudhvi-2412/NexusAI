'use client';

import React, { useState } from 'react';
import { AgentRun, ActivityStep } from '@/lib/api/types';
import { MOCK_ACTIVE_RUN, MOCK_AGENTS } from '@/lib/api/mock-data';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import {
  Activity,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Terminal,
  Zap,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { toast } from '@/lib/hooks/use-toast';

export function ActivityView() {
  const [run, setRun] = useState<AgentRun>(MOCK_ACTIVE_RUN);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulateNewStep = () => {
    setIsSimulating(true);
    toast({
      title: 'Emitting Telemetry Event',
      description: 'Simulating runtime tool dispatch via MCP Gateway.',
      variant: 'info',
    });
    setTimeout(() => {
      setIsSimulating(false);
      toast({
        title: 'Step Completed',
        description: 'MCP execution logged with sub-millisecond trace.',
        variant: 'success',
      });
    }, 1200);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-sky-400" />
            <span>Agent Orchestration Telemetry</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Safe execution traces without exposing private chain-of-thought scratchpads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSimulateNewStep}
            isLoading={isSimulating}
            className="text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Refresh Telemetry
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              toast({ title: 'Autonomous Loop Running', description: 'Monitoring registered MCP events.' });
            }}
            className="text-xs"
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Trigger Test Run
          </Button>
        </div>
      </div>

      {/* Primary Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-sky-500/20 bg-sky-950/10">
          <CardContent className="pt-5 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">Current Agent</div>
            <div className="text-base font-bold text-white flex items-center gap-2 font-mono">
              <Cpu className="w-4 h-4 text-sky-400" />
              <span>{run.agentName}</span>
            </div>
            <div className="text-[11px] text-sky-300 font-mono">Model: Gemini 1.5 Pro</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">Current Task</div>
            <div className="text-sm font-semibold text-slate-200 truncate">{run.taskTitle}</div>
            <div className="text-[11px] text-slate-400 font-mono">ID: {run.id}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">Execution Status</div>
            <div className="flex items-center gap-2">
              <Badge variant={run.status === 'running' ? 'info' : 'success'}>
                {run.status.toUpperCase()}
              </Badge>
              <span className="text-xs text-slate-400 font-mono">Step 4 of 5</span>
            </div>
            <div className="text-[11px] text-amber-400 font-mono flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              <span>Awaiting human approval</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">Token & Cost Metrics</div>
            <div className="text-base font-bold text-slate-100 font-mono flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>{run.tokenUsage?.totalTokens.toLocaleString()} tokens</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Est. Cost: ${(run.tokenUsage?.estimatedCostUsd ?? 0.0094).toFixed(4)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Execution Timeline Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>Agent Run Execution Tree</span>
            </span>
            <span className="text-xs text-slate-400 font-mono font-normal">
              Safe progress summaries only
            </span>
          </CardTitle>
          <CardDescription>
            Decomposed subtask sequence, memory retrievals, and MCP tool invocations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 pt-2 font-mono">
            {run.steps.map((step: ActivityStep, idx: number) => {
              const isLast = idx === run.steps.length - 1;
              const isCompleted = step.status === 'completed';
              const isActive = step.status === 'active';
              const isFailed = step.status === 'failed';

              return (
                <div key={step.id} className="relative flex items-start gap-4">
                  {/* Tree branch line */}
                  {!isLast && (
                    <span className="absolute left-[13px] top-[26px] bottom-[-16px] w-px bg-slate-800" />
                  )}

                  {/* Node icon */}
                  <div className="mt-1 shrink-0 z-10 w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                    {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {isActive && <Clock className="w-4 h-4 text-sky-400 animate-spin" />}
                    {isFailed && <AlertCircle className="w-4 h-4 text-rose-400" />}
                    {!isCompleted && !isActive && !isFailed && (
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                  </div>

                  {/* Step Body */}
                  <div className="flex-1 rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 transition-all hover:border-slate-700/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200 text-sm">{step.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {step.agentName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {step.durationMs && <span>{formatDuration(step.durationMs)}</span>}
                        <Badge
                          variant={
                            isCompleted ? 'success' : isActive ? 'info' : isFailed ? 'destructive' : 'default'
                          }
                          size="sm"
                        >
                          {step.status}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 font-sans leading-relaxed">
                      {step.summary}
                    </p>

                    {/* Tool details if present */}
                    {step.toolCall && (
                      <div className="mt-3 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs space-y-2">
                        <div className="flex items-center justify-between text-sky-400">
                          <span className="flex items-center gap-1.5 font-bold">
                            <Terminal className="w-3.5 h-3.5" />
                            Tool: {step.toolCall.name}
                          </span>
                          <span className="text-slate-500">{step.toolCall.server}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Parameters: {JSON.stringify(step.toolCall.input)}
                        </div>
                      </div>
                    )}

                    {step.type === 'approval_wait' && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-300 text-xs">
                          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Human authorization required before execution resumes</span>
                        </div>
                        <a
                          href="/approvals"
                          className="text-xs font-semibold text-amber-400 hover:underline"
                        >
                          Review Action &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
