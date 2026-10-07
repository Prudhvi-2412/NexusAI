'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { MessageSquare, Activity, Blocks, Brain, ListTodo, ShieldCheck, BarChart3, Settings, PanelLeftClose, PanelLeftOpen, Menu, X, Search, ArrowUpRight, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export const navigation = [
  { href: '/', label: 'Workspace', icon: MessageSquare },
  { href: '/apps', label: 'Connections', icon: Blocks },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/memory', label: 'Memory', icon: Brain },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { href: '/observability', label: 'Insights', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Brand({ size = 32 }: { size?: number }) {
  return <Image src="/brand/nexus-mark.png" alt="" width={size} height={size} sizes={size + 'px'} className="object-contain shrink-0" />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width:768px) and (max-width:1023px)');
    const resize = () => setCollapsed(media.matches);
    resize(); media.addEventListener('change',resize);
    return () => media.removeEventListener('change',resize);
  },[]);
  useEffect(() => {
    if(!mobileOpen) return;
    const previous = document.activeElement as HTMLElement;
    const key = (event:KeyboardEvent) => {
      if(event.key === 'Escape') setMobileOpen(false);
      if(event.key === 'Tab') {
        const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button,a[href]') || []);
        const first=nodes[0], last=nodes[nodes.length-1];
        if(event.shiftKey && document.activeElement === first){event.preventDefault();last?.focus();}
        if(!event.shiftKey && document.activeElement === last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',key);
    return () => {window.removeEventListener('keydown',key);previous?.focus();};
  },[mobileOpen]);
  useEffect(() => { setMobileOpen(false); }, [path]);
  const title = navigation.find(item => item.href === path)?.label || 'Workspace';
  const openSearch = () => window.dispatchEvent(new Event('nexus:search'));
  const signOut = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.reload();
  };
  const nav = (compact = false) => <nav aria-label="Main navigation" className="shrink-0 space-y-1">
    {navigation.map(({ href, label, icon: Icon }, index) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} title={compact ? label : undefined} className={cn('relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors', index === 4 && 'mt-6', path === href ? 'bg-[#303030] text-white' : 'text-slate-400 hover:text-white hover:bg-white/5', compact && 'justify-center')}>
      <Icon size={20} strokeWidth={1.7} /><span className={compact ? 'sr-only' : ''}>{label}</span>
    </Link>)}
  </nav>;
  return <MotionConfig reducedMotion="user">
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <a href="#main-content" className="fixed -top-20 focus:top-4 left-4 z-[100] bg-white text-black p-3 rounded-lg">Skip to content</a>
      <aside aria-label="Workspace sidebar" tabIndex={0} className={cn('hidden md:flex min-h-0 overflow-y-auto overscroll-contain flex-col bg-[#171717] border-r border-white/[.04] p-4 shrink-0 transition-[width] duration-200', collapsed ? 'w-[76px]' : 'w-[248px]')}>
        <div className={cn('flex shrink-0 items-center h-12 mb-8', collapsed ? 'justify-center' : 'justify-between')}>
          <Link href="/" aria-label="NexusAI workspace" className="flex items-center gap-3"><Brand />{!collapsed && <span className="font-semibold text-lg tracking-tight">NexusAI</span>}</Link>
          {!collapsed && <button aria-label="Collapse sidebar" onClick={() => setCollapsed(true)} className="p-2 text-slate-500 hover:text-white"><PanelLeftClose size={18} /></button>}
        </div>
        {collapsed ? <button aria-label="Expand sidebar" onClick={() => setCollapsed(false)} className="p-3 mb-4 text-slate-400"><PanelLeftOpen size={20} /></button> : <button onClick={openSearch} className="flex items-center gap-3 rounded-xl bg-white/[.04] border border-white/[.06] px-3 py-3 mb-5 text-sm text-slate-400"><Search size={16} />Search <kbd className="ml-auto text-[11px]">Ctrl K</kbd></button>}
        {nav(collapsed)}
        <div className="mt-auto shrink-0 pt-8">{!collapsed && <div className="rounded-2xl p-4 bg-gradient-to-br from-[#303030] to-[#232323] border border-white/[.06]"><p className="text-sm font-medium">A little less busy.</p><p className="text-xs text-slate-400 mt-2 leading-relaxed">Your email, calendar, and ideas. One thoughtful workspace.</p><Link href="/apps" className="flex items-center gap-1 text-xs mt-4 text-slate-200">Manage connections <ArrowUpRight size={14} /></Link></div>}
          <div className={cn('flex gap-3 items-center pt-5', collapsed && 'justify-center')}><div className="w-9 h-9 rounded-full bg-[#353535] flex items-center justify-center text-sm font-medium">N</div>{!collapsed && <div><p className="text-sm">Personal workspace</p><p className="text-xs text-slate-500 mt-0.5">Powered by Gemini</p></div>}</div>
        </div>
      </aside>
      <div className="flex flex-1 flex-col min-w-0 nexus-shell">
        <header className="h-16 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="md:hidden p-2 -ml-2"><Menu size={21} /></button><span className="text-sm font-medium text-slate-300">{title}</span></div>
          <div className="flex items-center gap-2"><button onClick={openSearch} aria-label="Search workspace" className="flex items-center gap-2 text-slate-400 p-2 rounded-lg hover:bg-white/5"><Search size={18} /><span className="hidden sm:inline text-xs">Search workspace</span></button><button onClick={signOut} aria-label="Sign out" title="Sign out" className="flex items-center gap-2 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><LogOut size={17} /><span className="hidden sm:inline text-xs">Sign out</span></button></div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto"><motion.div key={path} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.22}} className="h-full">{children}</motion.div></main>
        <nav aria-label="Mobile navigation" className="mobile-nav md:hidden grid grid-cols-4 bg-[#191919] border-t border-white/[.07] shrink-0">
          {navigation.slice(0, 3).map(({href,label,icon:Icon}) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={cn('flex flex-col items-center gap-1 py-3 text-[10px]',path === href ? 'text-white' : 'text-slate-500')}><Icon size={20} /><span>{label}</span></Link>)}
          <button onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-1 py-3 text-[10px] text-slate-400"><Menu size={20} />More</button>
        </nav>
      </div>
      <AnimatePresence>{mobileOpen && <motion.div className="fixed inset-0 z-40 md:hidden bg-black/60 backdrop-blur-sm" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setMobileOpen(false)}>
        <motion.aside ref={menuRef} role="dialog" aria-modal="true" aria-label="Navigation" className="h-full w-[min(320px,88vw)] bg-[#202020] p-5 overflow-y-auto" initial={{x:-320}} animate={{x:0}} exit={{x:-320}} transition={{duration:.22}} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-8"><div className="flex items-center gap-3"><Brand /><span className="font-semibold text-lg">NexusAI</span></div><button autoFocus onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="p-2"><X size={20} /></button></div>{nav()}
        </motion.aside>
      </motion.div>}</AnimatePresence>
    </div>
  </MotionConfig>;
}
