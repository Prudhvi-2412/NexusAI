'use client';

import React from 'react';
import { useToasts } from '@/lib/hooks/use-toast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToastContainer() {
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {toasts.map((t) => {
        const isSuccess = t.variant === 'success';
        const isDestructive = t.variant === 'destructive';
        const isInfo = t.variant === 'info';

        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-2xl transition-all duration-200 border animate-fade-in backdrop-blur-md',
              isSuccess && 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200',
              isDestructive && 'bg-rose-950/80 border-rose-500/30 text-rose-200',
              isInfo && 'bg-sky-950/80 border-sky-500/30 text-sky-200',
              !isSuccess && !isDestructive && !isInfo && 'bg-slate-900/90 border-slate-700/60 text-slate-200'
            )}
          >
            <div className="mt-0.5 shrink-0">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {isDestructive && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {isInfo && <Info className="w-5 h-5 text-sky-400" />}
              {!isSuccess && !isDestructive && !isInfo && <Info className="w-5 h-5 text-indigo-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold tracking-tight">{t.title}</h4>
              {t.description && (
                <p className="text-xs mt-1 text-slate-300/80 leading-relaxed">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-1 hover:bg-white/10 rounded-md transition-colors text-slate-400 hover:text-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
