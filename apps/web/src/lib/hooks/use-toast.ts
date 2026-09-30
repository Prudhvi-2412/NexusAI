'use client';

import { useState, useEffect } from 'react';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'destructive' | 'info';
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach((listener) => listener([...toasts]));
}

export function toast({
  title,
  description,
  variant = 'default',
  duration = 3500,
}: Omit<ToastItem, 'id'>) {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast: ToastItem = { id, title, description, variant, duration };
  toasts = [...toasts, newToast];
  notify();

  if (duration > 0) {
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      notify();
    }, duration);
  }
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function useToasts() {
  const [currentToasts, setCurrentToasts] = useState<ToastItem[]>(toasts);

  useEffect(() => {
    listeners.add(setCurrentToasts);
    return () => {
      listeners.delete(setCurrentToasts);
    };
  }, []);

  return { toasts: currentToasts, dismiss: dismissToast };
}
