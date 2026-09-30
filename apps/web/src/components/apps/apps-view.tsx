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
  Plus,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import { toast } from '@/lib/hooks/use-toast';

export function AppsView() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<ConnectedApp | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    api.getIntegrations().then(setApps);
  }, []);

  const handleToggleConnect = async (app: ConnectedApp) => {
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
      case 'telegram':
        return <Send className="w-6 h-6 text-blue-400" />;
      case 'browser_playwright':
        return <Globe className="w-6 h-6 text-emerald-400" />;
      case 'slack':
        return <Hash className="w-6 h-6 text-purple-400" />;
      case 'notion':
        return <BookOpen className="w-6 h-6 text-slate-300" />;
      default:
        return <Terminal className="w-6 h-6 text-sky-400" />;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Connected Apps</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect Google for read-only Gmail and Calendar access. Other integrations are planned.
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {apps.map((app) => {
          const isConnected = app.status === 'connected';

          return (
            <Card
              key={app.id}
              className="flex flex-col justify-between hover:border-slate-700/80 transition-all bg-slate-900/60"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70">
                    {getAppIcon(app.type)}
                  </div>
                  <Badge variant={isConnected ? 'success' : 'default'} size="sm">
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
                    Adapter
                  </div>
                  <div className="text-slate-300 truncate">{app.mcpServerName}</div>
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
                    Exposed Tools ({app.toolsProvided.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {app.toolsProvided.map((tool) => (
                      <span
                        key={tool}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 truncate max-w-[170px]"
                      >
                        {tool}
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
                  Permissions ({app.scopes.length})
                </button>

                <Button
                  size="sm"
                  variant={isConnected ? 'outline' : 'primary'}
                  isLoading={connectingId === app.id}
                  onClick={() => handleToggleConnect(app)}
                  className="text-xs"
                >
                  {isConnected ? 'Disconnect' : 'Connect App'}
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
          description="Permissions granted to NexusAI for this connection."
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
              <div className="text-slate-500 uppercase text-[10px]">Endpoint Protocol</div>
              <div className="text-sky-300">{selectedApp.mcpServerEndpoint || 'stdio (Local Process Subprocess)'}</div>
            </div>

            <div className="space-y-2">
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
            </div>

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
