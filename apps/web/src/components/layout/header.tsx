'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Cpu, Zap, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/shared/badge';

export function Header() {
  const pathname = usePathname();

  const getPageTitle = (path: string) => {
    switch (path) {
      case '/':
        return { title: 'Agent Console', subtitle: 'Supervisor & Multi-Agent Execution Hub' };
      case '/activity':
        return { title: 'Live Agent Activity', subtitle: 'Real-time orchestration traces & tool timelines' };
      case '/apps':
        return { title: 'Connected Apps', subtitle: 'Model Context Protocol (MCP) tool integrations' };
      case '/memory':
        return { title: 'Memory Bank', subtitle: 'Semantic memories, user preferences, & pgvector index' };
      case '/tasks':
        return { title: 'Tasks & Scheduled Cron', subtitle: 'Autonomous recurring workflows & background runners' };
      case '/approvals':
        return { title: 'Human-in-the-Loop Approval Center', subtitle: 'Review and authorize high-impact agent actions' };
      case '/observability':
        return { title: 'Agent Runs & Observability', subtitle: 'Cost metrics, latency analytics, and execution traces' };
      case '/settings':
        return { title: 'System Settings', subtitle: 'Model provider, autonomy guardrails, & profile configuration' };
      default:
        return { title: 'NexusAI OS', subtitle: 'Autonomous Agentic Operating System' };
    }
  };

  const { title, subtitle } = getPageTitle(pathname);
  const displaySubtitle = pathname === '/' ? subtitle : `Preview only · ${subtitle}`;

  return (
    <header className="h-16 shrink-0 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md px-6 flex items-center justify-between z-20">
      <div>
        <h1 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
          {title}
        </h1>
        <p className="text-xs text-slate-400 hidden sm:block">{displaySubtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Model Indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300">
          <Zap className="w-3.5 h-3.5 text-sky-400" />
          <span>Model: Gemini</span>
        </div>

        {/* Mock Mode / Connection Status */}
        <Badge variant="info" size="sm" className="hidden sm:inline-flex items-center gap-1 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
          <span>{process.env.NEXT_PUBLIC_USE_MOCK_API === 'false' && pathname === '/' ? 'Live Chat' : 'Preview Data'}</span>
        </Badge>

        {/* Security / Guardrail Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[11px] font-medium">Approvals Preview</span>
        </div>
      </div>
    </header>
  );
}
