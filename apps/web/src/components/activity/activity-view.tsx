'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AgentRun } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Card, CardContent } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Activity, Clock, RefreshCw, AlertCircle, CheckCircle2, Play } from 'lucide-react';
import { formatDuration, formatTimeAgo } from '@/lib/utils';
import { StreamListener } from '@/lib/api/sse-simulator';

export function ActivityView() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resumingRunId, setResumingRunId] = useState<string | null>(null);
  const [resumeResultRunId, setResumeResultRunId] = useState<string | null>(null);
  const [resumeOutput, setResumeOutput] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setRuns(await api.getActivityRuns()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load activity'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const resume = (run: AgentRun) => {
    setResumingRunId(run.id);
    setResumeResultRunId(run.id);
    setResumeOutput('');
    const listener: StreamListener = {
      onEvent: (event) => {
        if (event.type === 'run:error') setError(String(event.data.error || 'Could not resume this run.'));
      },
      onChunk: (chunk) => setResumeOutput((value) => value + chunk),
      onError: (failure) => { setError(failure.message); setResumingRunId(null); },
      onComplete: () => {
        setResumingRunId(null);
        void refresh();
      },
    };
    api.resumeAgentRun(run.id, listener);
  };

  return <div className="workspace-page space-y-6">
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-white"><Activity className="h-5 w-5 text-sky-400" />Recent activity</h2>
        <p className="mt-1 text-xs text-slate-400">Account activity recorded from chat and scheduled assistant runs.</p></div>
      <Button size="sm" variant="outline" onClick={() => void refresh()} isLoading={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-sm text-rose-300">{error}</p>}
    {!loading && !error && runs.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-slate-400">No runs recorded yet. Start a chat or create a scheduled task.</CardContent></Card>}
    <div className="space-y-3">{runs.map(run => <Card key={run.id}><CardContent className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-slate-100">{run.taskTitle}</h3><Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'destructive' : 'info'}>{run.status}</Badge></div>
        <p className="mt-1 text-xs text-slate-400">{run.agentName} · {formatTimeAgo(run.startedAt)} · {run.durationMs ? formatDuration(run.durationMs) : 'in progress'}</p></div>
        <span className="font-mono text-[11px] text-slate-500">{run.id}</span></div>
      {run.error && <p className="mt-3 flex items-center gap-2 text-xs text-rose-300"><AlertCircle size={14}/>{run.error}</p>}
      {run.status === 'failed' && run.conversationId && <div className="mt-3"><Button size="sm" variant="outline" disabled={resumingRunId !== null} isLoading={resumingRunId === run.id} onClick={() => resume(run)}><Play size={14} className="mr-2"/>Resume from checkpoint</Button></div>}
      {resumeResultRunId === run.id && resumeOutput && <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">{resumeOutput}</p>}
      {run.steps?.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-xs text-sky-300">Show {run.steps.length} recorded steps</summary><ol className="mt-3 space-y-2">{run.steps.map(step => <li key={step.id} className="flex gap-2 text-xs"><CheckCircle2 size={14} className={step.status === 'failed' ? 'text-rose-400' : 'text-emerald-400'}/><span className="text-slate-200">{step.name}</span><span className="text-slate-500">{step.summary}</span></li>)}</ol></details>}
    </CardContent></Card>)}</div>
    {!loading && runs.length > 0 && <p className="flex items-center gap-2 text-[11px] text-slate-500"><Clock size={13}/>Run records are scoped to your signed-in account.</p>}
  </div>;
}
