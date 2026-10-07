'use client';

import React, { useState, useEffect } from 'react';
import { ConnectedApp } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Modal } from '@/components/shared/modal';
import {
  Mail,
  Calendar,
  Send,
  Globe,
  Hash,
  BookOpen,
  ContactRound,
  Plus,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Terminal,
  RefreshCw,
  Github,
} from 'lucide-react';
import { toast } from '@/lib/hooks/use-toast';
import { ConnectionAnimation } from '@/components/shared/connection-animation';

export function AppsView() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<ConnectedApp | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [telegramLink, setTelegramLink] = useState<{ code: string; command: string } | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const loadApps = () => {
    setLoading(true); setLoadError(false);
    api.getIntegrations().then(setApps).catch(() => setLoadError(true)).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (selectedApp?.type !== 'telegram' || !telegramLink) return;
    const timer = window.setInterval(() => {
      api.getIntegrations().then((next) => {
        setApps(next);
        const telegram = next.find((app) => app.type === 'telegram');
        if (telegram?.status === 'connected') {
          setSelectedApp(telegram);
          setTelegramLink(null);
          toast({ title: 'Telegram connected', description: 'Your Telegram account is linked to this NexusAI account.', variant: 'success' });
        }
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [selectedApp?.type, telegramLink]);

  const handleToggleConnect = async (app: ConnectedApp) => {
    if (app.type === 'telegram') {
      setSelectedApp(app);
      setTelegramLink(null);
      return;
    }
    setConnectingId(app.id);
    try {
      if (app.status === 'connected' && process.env.NEXT_PUBLIC_USE_MOCK_API === 'false') {
        await api.disconnectIntegration(app.id);
      } else {
        const res = await api.connectIntegration(app.id);
        if (res.authUrl) {
          window.location.assign(res.authUrl);
          return;
        }
      }
      setApps(await api.getIntegrations());
      toast({
        title: app.status === 'connected' ? 'Disconnected App' : 'Connected App',
        description: `${app.name} connection updated.`,
        variant: app.status === 'connected' ? 'default' : 'success',
      });
    } catch (err) {
      toast({
        title: 'Connection Error',
        description: err instanceof Error ? err.message : 'Failed to update integration state.',
        variant: 'destructive',
      });
    } finally {
      setConnectingId(null);
    }
  };

  const getAppIcon = (type: string) => {
    switch (type) {
      case 'gmail':
        return <Mail className="w-6 h-6 text-rose-400" />;
      case 'google_calendar':
        return <Calendar className="w-6 h-6 text-sky-400" />;
      case 'google_classroom':
        return <BookOpen className="w-6 h-6 text-amber-300" />;
      case 'google_contacts':
        return <ContactRound className="w-6 h-6 text-violet-300" />;
      case 'telegram':
        return <Send className="w-6 h-6 text-blue-400" />;
      case 'browser_playwright':
        return <Globe className="w-6 h-6 text-emerald-400" />;
      case 'slack':
        return <Hash className="w-6 h-6 text-purple-400" />;
      case 'notion':
        return <BookOpen className="w-6 h-6 text-slate-300" />;
      case 'github':
        return <Github className="w-6 h-6 text-slate-200" />;
      default:
        return <Terminal className="w-6 h-6 text-sky-400" />;
    }
  };

  return (
    <div className="workspace-page space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Your world, connected.</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Give NexusAI the context to help. Gmail drafts pause for your approval and are never sent by NexusAI; other Google and GitHub actions stay read-only.
          </p>
        </div>

        {process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false' && <Button
          size="sm"
          variant="primary"
          onClick={() => setIsAddModalOpen(true)}
          className="text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Custom MCP Server
        </Button>}
      </div>

      {/* Grid of Apps */}
      {loadError && <div role="alert" className="rounded-2xl border border-slate-700 p-6"><p className="text-sm">Your connections couldn’t be loaded.</p><Button variant="outline" onClick={loadApps} className="mt-4">Try again</Button></div>}
      {loading && <div role="status" aria-label="Loading connections" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{[1,2,3].map(i => <div key={i} className="h-64 rounded-2xl bg-white/5 animate-pulse" />)}</div>}
        {apps.some(app => app.status === 'connected') && <div className="flex items-center gap-4 p-5 rounded-2xl border border-white/[.07] bg-gradient-to-r from-[#303030] to-[#262626]"><ConnectionAnimation /><div><p className="font-medium text-sm">You’re connected.</p><p className="text-sm text-slate-400 mt-1">Ask about email, today’s schedule, Classroom assignments, saved contacts, or your GitHub repositories.</p></div></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {apps.map((app) => {
          const isConnected = app.status === 'connected';
          const environmentManaged = process.env.NEXT_PUBLIC_USE_MOCK_API === 'false' && app.type === 'telegram';

          return (
            <Card
              key={app.id}
              className="flex flex-col justify-between hover:border-slate-700/80 transition-all bg-slate-900/60"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="integration-icon p-3 rounded-2xl border">
                    {getAppIcon(app.type)}
                  </div>
                  <Badge variant={isConnected ? 'success' : 'default'} size="sm" className="gap-1">
                    {isConnected && <CheckCircle2 size={12} />}
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>

                <div className="pt-2">
                  <CardTitle className="text-base">{app.name}</CardTitle>
                  <CardDescription className="line-clamp-2 mt-1">
                    {app.description}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                {/* Account / Identifier */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs font-mono space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Connection
                  </div>
                  <div className="text-slate-300">{environmentManaged
                    ? isConnected ? 'Linked to your NexusAI account' : 'Shared bot is ready for account linking'
                    : isConnected ? (app.id === 'app_gmail' ? 'Read access and approval-gated drafts enabled' : 'Read-only access enabled') : 'Ready to connect'}</div>
                  {environmentManaged && !isConnected && <div className="text-[10px] text-slate-500">Create an expiring link code to connect your Telegram account.</div>}
                  {app.accountEmail && (
                    <div className="text-[11px] text-sky-400 truncate">{app.accountEmail}</div>
                  )}
                  {app.accountHandle && (
                    <div className="text-[11px] text-blue-400 truncate">{app.accountHandle}</div>
                  )}
                </div>

                {/* Declared Tools Pill List */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                    Capabilities ({app.toolsProvided.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {app.toolsProvided.map((tool) => (
                      <span
                        key={tool}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 truncate max-w-[170px]"
                      >
                        {{gmail_list_unread:'Summarize unread email',calendar_list_upcoming:'View upcoming events'}[tool] || tool.replace(/_/g,' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex items-center justify-between gap-2 border-t border-slate-800/70 pt-3">
                <button
                  onClick={() => setSelectedApp(app)}
                  className="text-xs text-slate-400 hover:text-slate-200 font-medium"
                >
                  {environmentManaged ? 'Setup details' : `Permissions (${app.scopes.length})`}
                </button>

                <Button
                  size="sm"
                  variant={isConnected ? 'outline' : 'primary'}
                  isLoading={connectingId === app.id}
                  onClick={() => handleToggleConnect(app)}
                  disabled={false}
                  className="text-xs"
                >
                  {environmentManaged ? isConnected ? 'Manage' : 'Link Telegram' : isConnected ? 'Disconnect' : 'Connect App'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Permissions & Scopes Detail Modal */}
      {selectedApp && (
        <Modal
          isOpen={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          title={`${selectedApp.name} Permissions & Scopes`}
          description={selectedApp.type === 'telegram'
            ? 'Link your Telegram account to this NexusAI account. The shared bot only responds after you link it.'
            : 'Permissions granted to NexusAI for this connection.'}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
              <div className="text-slate-500 uppercase text-[10px]">Endpoint Protocol</div>
              <div className="text-sky-300">{selectedApp.mcpServerName || 'External connection'}</div>
            </div>

            {selectedApp.type === 'telegram' ? (
              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                {selectedApp.status === 'connected' ? (
                  <>
                    <p className="text-sm text-slate-300">Telegram is linked to your NexusAI account. Your messages use your account’s own conversations and Google connections.</p>
                    <Button size="sm" variant="outline" disabled={telegramBusy} onClick={async () => {
                      setTelegramBusy(true);
                      try {
                        await api.unlinkTelegram();
                        setSelectedApp({ ...selectedApp, status: 'disconnected', accountHandle: undefined });
                        setApps(await api.getIntegrations());
                        setTelegramLink(null);
                        toast({ title: 'Telegram unlinked', description: 'The bot will no longer access your NexusAI account.', variant: 'success' });
                      } catch (error) {
                        toast({ title: 'Could not unlink Telegram', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                      } finally { setTelegramBusy(false); }
                    }}>Unlink Telegram</Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-400">Create a one-time code, then send <span className="font-mono text-slate-200">/link YOUR_CODE</span> to <span className="font-medium text-blue-300">@NexusChiefOfStaffBot</span> in a private chat. The code expires in 10 minutes.</p>
                    {telegramLink && <div className="rounded-lg border border-slate-800 bg-black/30 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">One-time command</div><code className="mt-1 block break-all text-sm text-sky-300">{telegramLink.command}</code></div>}
                    <Button size="sm" variant="primary" disabled={telegramBusy} isLoading={telegramBusy} onClick={async () => {
                      setTelegramBusy(true);
                      try {
                        const link = await api.createTelegramLink();
                        setTelegramLink(link);
                      } catch (error) {
                        toast({ title: 'Could not create link code', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                      } finally { setTelegramBusy(false); }
                    }}>{telegramLink ? 'Create a new code' : 'Create link code'}</Button>
                  </>
                )}
              </div>
            ) : <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-200">Granted Scopes</div>
              <div className="space-y-2">
                {selectedApp.scopes.map((s) => (
                  <div
                    key={s.name}
                    className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-start gap-3"
                  >
                    <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-semibold text-slate-200">{s.name}</p>
                      <p className="text-[11px] text-slate-400">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>}

            <div className="flex justify-end pt-2">
              <Button size="sm" variant="secondary" onClick={() => setSelectedApp(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Custom MCP Server Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register Custom MCP Server"
        description="Add a custom tool server adhering to the Anthropic Model Context Protocol specification."
        maxWidth="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setIsAddModalOpen(false);
            toast({
              title: 'Custom MCP Server Registered',
              description: 'FastAPI client will probe schemas during discovery handshake.',
              variant: 'success',
            });
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Server Name</label>
            <input
              type="text"
              placeholder="e.g. mcp-server-salesforce"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Transport Type</label>
            <select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500">
              <option value="stdio">stdio (Local Subprocess / Python CLI)</option>
              <option value="sse">Server-Sent Events (SSE over HTTP)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Command or URL</label>
            <input
              type="text"
              placeholder="e.g. python -m mcp_salesforce"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Register Server
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
