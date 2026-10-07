'use client';

import React, { useState, useEffect } from 'react';
import { ObservabilityRun, SystemHealthSummary } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Modal } from '@/components/shared/modal';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Zap,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Terminal,
  Cpu,
  ShieldCheck,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { formatDuration, formatTimeAgo } from '@/lib/utils';

export function ObservabilityView() {
  const [runs, setRuns] = useState<ObservabilityRun[]>([]);
  const [health, setHealth] = useState<SystemHealthSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<ObservabilityRun | null>(null);

  useEffect(() => {
    api.getObservabilityRuns().then(setRuns);
    api.getSystemHealth().then(setHealth);
  }, []);

  const filteredRuns = runs.filter((r) => {
    if (statusFilter === 'all') return true;
    return r.status === statusFilter;
  });

  return (
    <div className="workspace-page space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-400" />
            <span>The bigger picture.</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Review recorded runs and measured response times for this account.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="success" size="md" className="font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1"></span>
            Account data
          </Badge>
        </div>
      </div>

      {/* KPI Highlights Grid */}
      {health && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="bg-slate-900/40">
            <CardContent className="pt-5 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>24h Success Rate</span>
              </div>
              <div className="text-2xl font-bold text-white font-mono">{health.successRate24h}%</div>
              <div className="text-[10px] text-slate-400 font-mono">{health.completedRuns24h ?? 0} completed / {health.runs24h ?? 0} runs</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40">
            <CardContent className="pt-5 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Average Latency</span>
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {formatDuration(health.averageLatencyMs)}
              </div>
              <div className="text-[10px] text-sky-300 font-mono">Completed runs, last 24 hours</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40">
            <CardContent className="pt-5 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>24h Run Volume</span>
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {health.runs24h ?? 0}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">{health.failedRuns24h ?? 0} failed runs</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40">
            <CardContent className="pt-5 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pending Approvals</span>
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {health.pendingApprovalsCount}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Awaiting your decision</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
          {['all', 'running', 'completed', 'failed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-all ${
                statusFilter === tab
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400 font-mono">
          Showing {filteredRuns.length} registered runs
        </div>
      </div>

      {/* Runs Table */}
      <div className="grid sm:grid-cols-2 gap-3 lg:hidden">
        {filteredRuns.map(run => <button key={run.id} onClick={() => setSelectedRun(run)} className="nexus-card rounded-2xl border border-white/[.07] bg-[#262626] p-5 text-left hover:bg-[#303030] transition-colors">
          <div className="flex items-center justify-between gap-3 mb-4"><span className="text-xs text-slate-400">{run.agentName}</span><Badge size="sm">{run.status}</Badge></div>
          <p className="text-sm font-medium leading-relaxed">{run.taskTitle}</p>
          <div className="flex items-center gap-4 text-xs text-slate-400 mt-4"><span>{formatDuration(run.durationMs)}</span><span>{run.toolCallCount} tools</span><span className="ml-auto">View details →</span></div>
        </button>)}
      </div>
      <Card className="hidden lg:block bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Run ID</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Directive / Task</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Tools</th>
                <th className="px-4 py-3">Recorded At</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono">
              {filteredRuns.map((run) => (
                <tr
                  key={run.id}
                  className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedRun(run)}
                >
                  <td className="px-4 py-3.5 text-sky-400 font-semibold">
                    {run.id}
                  </td>
                  <td className="px-4 py-3.5 text-slate-200 font-sans font-medium whitespace-nowrap">
                    {run.agentName}
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 font-sans max-w-xs truncate">
                    {run.taskTitle}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Badge
                      variant={
                        run.status === 'completed'
                          ? 'success'
                          : run.status === 'running'
                          ? 'info'
                          : 'destructive'
                      }
                      size="sm"
                    >
                      {run.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                    {formatDuration(run.durationMs)}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {run.toolCallCount} calls
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">
                    <span>{formatTimeAgo(run.startedAt)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button aria-label={'View details for ' + run.taskTitle} onClick={() => setSelectedRun(run)} className="text-slate-400 hover:text-sky-400 p-1">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detailed Run Inspection Modal */}
      {selectedRun && (
        <Modal
          isOpen={!!selectedRun}
          onClose={() => setSelectedRun(null)}
          title={`Run Telemetry: ${selectedRun.id}`}
          description={`Detailed trace and execution metrics for ${selectedRun.agentName}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs font-mono">
            {/* Task Summary */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-sans">
              <span className="text-slate-400 text-[11px] font-mono uppercase">Goal Directive</span>
              <p className="text-sm font-semibold text-white">{selectedRun.taskTitle}</p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-slate-300">
              <span className="text-[11px] uppercase text-slate-500">Recorded run</span>
              <p className="mt-1">Started {new Date(selectedRun.startedAt).toLocaleString()} · Duration {formatDuration(selectedRun.durationMs)}</p>
            </div>

            {/* Tools Invoked */}
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                Tools Called ({selectedRun.toolsUsed.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedRun.toolsUsed.map((t) => (
                  <span
                    key={t}
                    className="p-1.5 rounded bg-slate-950 border border-slate-800 text-sky-300 text-xs flex items-center gap-1.5"
                  >
                    <Terminal className="w-3.5 h-3.5 text-slate-500" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Error banner if present */}
            {selectedRun.hasErrors && selectedRun.errorMessage && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 flex items-start gap-2.5 font-sans">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-xs text-rose-200">Execution Error Encountered</div>
                  <div className="text-xs mt-0.5">{selectedRun.errorMessage}</div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <Button size="sm" variant="secondary" onClick={() => setSelectedRun(null)}>
                Close Trace
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
