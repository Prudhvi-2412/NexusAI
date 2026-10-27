'use client';

import { useEffect, useRef, useState } from 'react';
import { api, BrowserSite, BrowserSnapshot } from '@/lib/api/client';
import { Button } from '@/components/shared/button';

export function BrowserConnection() {
  const [sites, setSites] = useState<BrowserSite[]>([]);
  const [url, setUrl] = useState('');
  const [loginId, setLoginId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BrowserSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<string | null>(null);

  useEffect(() => {
    api.getBrowserSites().then(setSites).catch((err) => setError(err instanceof Error ? err.message : 'Could not load saved sites'));
    return () => { if (loginRef.current) void api.cancelBrowserLogin(loginRef.current).catch(() => undefined); };
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await operation(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Browser request failed'); }
    finally { setBusy(false); }
  };

  const start = () => run(async () => {
    const result = await api.startBrowserLogin(url.trim());
    loginRef.current = result.loginId;
    setLoginId(result.loginId);
    setSnapshot(result.snapshot);
  });

  const interact = (action: { action: 'click' | 'type' | 'key' | 'scroll'; x?: number; y?: number; value?: string }) => run(async () => {
    if (!loginId) return;
    setSnapshot(await api.interactBrowserLogin(loginId, action));
    if (action.action === 'type' && textRef.current) textRef.current.value = '';
  });

  const save = () => run(async () => {
    if (!loginId) return;
    await api.saveBrowserLogin(loginId);
    loginRef.current = null;
    setLoginId(null);
    setSnapshot(null);
    setSites(await api.getBrowserSites());
  });

  const cancel = () => run(async () => {
    if (loginId) await api.cancelBrowserLogin(loginId);
    loginRef.current = null;
    setLoginId(null);
    setSnapshot(null);
  });

  const remove = (siteId: string) => run(async () => {
    await api.deleteBrowserSite(siteId);
    setSites(await api.getBrowserSites());
  });

  if (process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false') {
    return <p>Website sign-in is available when NexusAI is connected to the backend.</p>;
  }

  return <div className="space-y-4 text-sm text-slate-300">
    <p>Connect a website by signing in below. Start with the main website address when possible (for example, https://example.com). The browser view expires after 10 minutes of inactivity. NexusAI stores that site’s session encrypted for your account. Text typed here is not sent to the AI chat.</p>
    {error && <p role="alert" className="rounded-lg bg-rose-950/50 p-3 text-rose-300">{error}</p>}
    {!loginId ? <>
      <div className="flex gap-2">
        <input aria-label="Website URL" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
        <Button type="button" size="sm" isLoading={busy} disabled={busy || !url.trim()} onClick={start}>Open sign-in</Button>
      </div>
      <div>
        <h4 className="mb-2 font-medium text-white">Saved websites</h4>
        {sites.length === 0 ? <p className="text-slate-500">No websites connected yet.</p> : <div className="space-y-2">{sites.map((site) =>
          <div key={site.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 p-3">
            <div><p className="font-medium text-white">{site.host}</p><p className="text-xs text-slate-500">Ask NexusAI to inspect this website, or to prepare an action for approval.</p></div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => remove(site.id)}>Remove</Button>
          </div>)}</div>}
      </div>
    </> : <>
      <div className="flex items-center justify-between gap-2"><p className="truncate text-xs text-slate-400">{snapshot?.url}</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { if (loginId) setSnapshot(await api.getBrowserLogin(loginId)); })}>Refresh</Button></div>
      {snapshot && <button type="button" disabled={busy} aria-label="Click in website browser" className="block w-full overflow-hidden rounded-lg border border-slate-600 disabled:opacity-70" onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) * snapshot.width / rect.width);
        const y = Math.floor((event.clientY - rect.top) * snapshot.height / rect.height);
        void interact({ action: 'click', x, y });
      }}>
        {/* The image is an ephemeral data URL from the live browser session. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={snapshot.image} alt={`Sign-in browser: ${snapshot.title || snapshot.url}`} className="block w-full" />
      </button>}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={textRef} type="password" autoComplete="off" aria-label="Text for selected website field" placeholder="Type into selected field" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" onKeyDown={(event) => { if (event.key === 'Enter' && textRef.current?.value) { event.preventDefault(); void interact({ action: 'type', value: textRef.current.value }); } }} />
        <Button type="button" size="sm" disabled={busy} onClick={() => { if (textRef.current?.value) void interact({ action: 'type', value: textRef.current.value }); }}>Type</Button>
        {(['Tab', 'Enter', 'Backspace'] as const).map((key) => <Button key={key} type="button" size="sm" variant="outline" disabled={busy} onClick={() => interact({ action: 'key', value: key })}>{key}</Button>)}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => interact({ action: 'scroll', value: 'up' })}>Scroll up</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => interact({ action: 'scroll', value: 'down' })}>Scroll down</Button>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={cancel}>Cancel</Button><Button type="button" disabled={busy} isLoading={busy} onClick={save}>Save signed-in site</Button></div>
    </>}
    <p className="text-xs text-slate-500">Some sites block automation or require a CAPTCHA. Saved sessions may expire and need a new sign-in. Browser actions from chat still require approval.</p>
  </div>;
}
