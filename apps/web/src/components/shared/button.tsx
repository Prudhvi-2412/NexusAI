'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'accent';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-lg',
          // Variants
          variant === 'primary' &&
            'bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold shadow-md shadow-sky-500/20 active:scale-[0.98]',
          variant === 'accent' &&
            'bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/20 active:scale-[0.98]',
          variant === 'secondary' &&
            'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-[0.98]',
          variant === 'outline' &&
            'border border-slate-700 hover:border-slate-500 bg-transparent hover:bg-slate-800/60 text-slate-200 active:scale-[0.98]',
          variant === 'ghost' &&
            'bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-white',
          variant === 'destructive' &&
            'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 active:scale-[0.98]',
          // Sizes
          size === 'sm' && 'h-8 px-3 text-xs gap-1.5',
          size === 'md' && 'h-9 px-4 text-sm gap-2',
          size === 'lg' && 'h-11 px-6 text-base gap-2.5',
          size === 'icon' && 'h-9 w-9 p-0',
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-current" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
