'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowUpRight } from 'lucide-react';
import { Modal } from '@/components/shared/modal';
import { navigation } from './app-shell';
export function CommandPalette() {
  const [open,setOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [selected,setSelected] = useState(0);
  const router = useRouter();
  const filtered = navigation.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const show = () => { setQuery(''); setSelected(0); setOpen(true); };
    const key = (e:KeyboardEvent) => { if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(v=>!v); setQuery(''); setSelected(0); } };
    window.addEventListener('keydown',key); window.addEventListener('nexus:search',show);
    return () => { window.removeEventListener('keydown',key); window.removeEventListener('nexus:search',show); };
  },[]);
  const go = (href:string) => { setOpen(false); router.push(href); };
  return <Modal isOpen={open} onClose={() => setOpen(false)} title="Search workspace" description="Jump to a page. Use ↑ ↓ and Enter." maxWidth="lg">
    <div className="flex items-center gap-3 rounded-xl bg-[#202020] px-4 border border-slate-700">
      <Search size={18} className="text-slate-500" />
      <input autoFocus aria-label="Search pages" role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={filtered.length ? 'command-'+selected : undefined} value={query} onChange={e=>{setQuery(e.target.value);setSelected(0);}} onKeyDown={e=>{
        if(e.key==='ArrowDown'){e.preventDefault();setSelected(v=>(v+1)%Math.max(1,filtered.length));}
        if(e.key==='ArrowUp'){e.preventDefault();setSelected(v=>(v-1+filtered.length)%Math.max(1,filtered.length));}
        if(e.key==='Enter' && filtered[selected]){e.preventDefault();go(filtered[selected].href);}
      }} placeholder="Where would you like to go?" className="h-12 w-full bg-transparent text-sm outline-none focus-visible:outline-none" />
    </div>
    <p className="text-[11px] uppercase tracking-wider text-slate-500 mt-5 mb-2">Pages</p>
    <div id="command-results" role="listbox" aria-label="Pages" className="space-y-1">
      {filtered.map(({href,label,icon:Icon},i)=><button id={'command-'+i} role="option" aria-selected={selected===i} key={href} onMouseEnter={()=>setSelected(i)} onClick={()=>go(href)} className={'w-full flex items-center gap-3 text-sm p-3 rounded-xl text-left '+(selected===i?'bg-[#3a3a3a] text-white':'text-slate-400')}><Icon size={18}/>{label}<ArrowUpRight size={15} className="ml-auto text-slate-500"/></button>)}
      {!filtered.length && <p className="py-8 text-center text-sm text-slate-400">No matching pages.</p>}
    </div>
  </Modal>;
}
