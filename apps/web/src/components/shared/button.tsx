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
            'bg-primary hover:bg-[#8ab6ff] text-primary-foreground font-semibold shadow-sm active:scale-[0.97]',
          variant === 'accent' &&
            'bg-primary hover:bg-[#8ab6ff] text-primary-foreground font-semibold active:scale-[0.97]',
          variant === 'secondary' &&
            'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-[0.98]',
          variant === 'outline' &&
            'border border-slate-700 hover:border-slate-500 bg-transparent hover:bg-slate-800/60 text-slate-200 active:scale-[0.98]',
          variant === 'ghost' &&
            'bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-white',
          variant === 'destructive' &&
            'bg-slate-700 hover:bg-slate-600 text-white border border-slate-500 active:scale-[0.97]',
          // Sizes
          size === 'sm' && 'h-9 px-3 text-xs gap-1.5',
          size === 'md' && 'h-10 px-4 text-sm gap-2',
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
