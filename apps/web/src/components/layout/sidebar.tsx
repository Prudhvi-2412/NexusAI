'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  Activity,
  Layers,
  Brain,
  CalendarCheck,
  ShieldAlert,
  BarChart3,
  Settings,
  Cpu,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(2);

  useEffect(() => {
    api.getApprovals().then((approvals) => {
      const pending = approvals.filter((a) => a.status === 'pending').length;
      setPendingApprovalsCount(pending);
    }).catch(() => {});
  }, [pathname]);

  const navItems: NavItem[] = [
    { name: 'Agent Console', href: '/', icon: Bot },
    { name: 'Live Activity', href: '/activity', icon: Activity },
    { name: 'Connected Apps', href: '/apps', icon: Layers },
    { name: 'Memory Bank', href: '/memory', icon: Brain },
    { name: 'Tasks & Cron', href: '/tasks', icon: CalendarCheck },
    { name: 'Approval Center', href: '/approvals', icon: ShieldAlert, badge: pendingApprovalsCount },
    { name: 'Observability', href: '/observability', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 shrink-0 border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-xl flex flex-col h-screen select-none z-30">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/80">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white tracking-tight text-base">NexusAI</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20">
              OS v0.1
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Chief of Staff Engine</p>
        </div>
      </div>

      {/* Autonomous System Indicator */}
      <div className="p-3 mx-3 my-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-mono font-medium text-slate-300">Supervisor Active</span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Gemini 1.5</span>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto pt-1">
        <div className="px-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Workspace
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/25 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-200'
                  )}
                />
                <span>{item.name}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Active Autonomous Agent Widget */}
      <div className="p-3 m-3 rounded-xl border border-indigo-500/20 bg-gradient-to-b from-indigo-950/30 to-slate-900/40 text-xs">
        <div className="flex items-center gap-2 text-indigo-300 font-medium pb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Autonomous Guardrail</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Human-in-the-Loop strictness: <strong className="text-slate-200">Balanced</strong>. High-impact tools hold for verification.
        </p>
      </div>

      {/* Operator Status Footer */}
      <div className="p-3 border-t border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-sky-400">
            AV
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">Alex Vance</p>
            <p className="text-[10px] text-slate-400 truncate">Operator / Executive</p>
          </div>
        </div>
        <Link
          href="/settings"
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-md transition-colors"
          title="Account Settings"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </aside>
  );
}
