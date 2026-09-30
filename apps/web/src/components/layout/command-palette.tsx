'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, X, ArrowRight } from 'lucide-react';

const commands = [
  { label: 'Open Agent Console', href: '/' },
  { label: 'Open Connected Apps', href: '/apps' },
  { label: 'Open Tasks', href: '/tasks' },
  { label: 'Open Approval Center', href: '/approvals' },
  { label: 'Open Settings', href: '/settings' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) return null;
  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[14vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="nexus-surface w-full max-w-lg overflow-hidden rounded-2xl animate-scale-in" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-800 px-4">
          <Search className="h-4 w-4 text-slate-500" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search NexusAI" className="h-14 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
          <button aria-label="Close command palette" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-2">
          {filtered.map((command) => <Link key={command.href} href={command.href} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm text-slate-300 transition-colors hover:bg-sky-400/10 hover:text-white"><span>{command.label}</span><ArrowRight className="h-4 w-4 text-slate-600" /></Link>)}
          {!filtered.length && <p className="px-3 py-6 text-center text-sm text-slate-500">No commands found.</p>}
        </div>
        <div className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">Press <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">Ctrl K</kbd> to toggle</div>
      </div>
    </div>
  );
}
