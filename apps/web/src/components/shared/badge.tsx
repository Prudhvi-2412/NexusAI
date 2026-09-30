import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'outline' | 'purple';
  size?: 'sm' | 'md';
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full tracking-wide transition-colors',
        size === 'sm' && 'px-2 py-0.5 text-[10px] font-semibold',
        size === 'md' && 'px-2.5 py-0.5 text-xs',
        variant === 'default' && 'bg-slate-800 text-slate-300 border border-slate-700/60',
        variant === 'success' && 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30',
        variant === 'warning' && 'bg-amber-950/70 text-amber-400 border border-amber-500/30',
        variant === 'destructive' && 'bg-rose-950/70 text-rose-400 border border-rose-500/30',
        variant === 'info' && 'bg-sky-950/70 text-sky-400 border border-sky-500/30',
        variant === 'purple' && 'bg-indigo-950/70 text-indigo-300 border border-indigo-500/30',
        variant === 'outline' && 'border border-slate-700 text-slate-400',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
