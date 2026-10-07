'use client';

import { useEffect, useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'signed-in' | 'signed-out' | 'error'>('checking');
  const [email, setEmail] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/session`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) return setState('signed-out');
        if (!response.ok) throw new Error('Unable to check your sign-in session.');
        const data = await response.json();
        setEmail(data.email);
        setState('signed-in');
      })
      .catch(() => setState('error'));
  }, []);

  if (state === 'signed-in') return <>{children}</>;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">N</div>
          <div><p className="text-lg font-semibold">NexusAI</p><p className="text-sm text-muted-foreground">Your private assistant workspace</p></div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the approved Google account to open your conversations and connected services.</p>
        {state === 'checking' && <p className="mt-6 text-sm text-muted-foreground">Checking your session…</p>}
        {state === 'error' && <p className="mt-6 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">NexusAI could not reach the API. Make sure the backend is running.</p>}
        {state === 'signed-out' && <a className="mt-7 flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90" href={`${API_BASE_URL}/auth/google/start`}>Continue with Google</a>}
        {email && <p className="mt-5 text-xs text-muted-foreground">Signed in as {email}</p>}
      </section>
    </main>
  );
}
