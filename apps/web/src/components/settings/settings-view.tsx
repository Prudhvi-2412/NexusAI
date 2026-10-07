'use client';

import React, { useState, useEffect } from 'react';
import { SystemSettings, ModelProvider, MCPServer, MCPServerTestResult } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import {
  Settings,
  Shield,
  Zap,
  User,
  Bell,
  Sliders,
  DollarSign,
  Save,
  CheckCircle2,
  Lock,
  Server,
  KeyRound,
  Trash2,
  Pencil,
  FlaskConical,
  Plus,
} from 'lucide-react';
import { toast } from '@/lib/hooks/use-toast';

export function SettingsView() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'model' | 'guardrails' | 'user' | 'notifications' | 'connectors'>('guardrails');
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [mcpBusy, setMcpBusy] = useState<string | null>(null);
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null);
  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpToken, setMcpToken] = useState('');
  const [clearMcpToken, setClearMcpToken] = useState(false);
  const [mcpTestResults, setMcpTestResults] = useState<Record<string, MCPServerTestResult | string>>({});

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getMcpServers().then(setMcpServers).catch(() => toast({ title: 'Could not load MCP connectors', description: 'Check that the local API is running.', variant: 'destructive' }));
  }, []);

  const resetMcpForm = () => {
    setEditingMcpId(null);
    setMcpName('');
    setMcpUrl('');
    setMcpToken('');
    setClearMcpToken(false);
  };

  const saveMcpServer = async (event: React.FormEvent) => {
    event.preventDefault();
    setMcpBusy('save');
    try {
      const saved = await api.saveMcpServer({
        name: mcpName.trim(),
        url: mcpUrl.trim(),
        ...(mcpToken ? { token: mcpToken } : {}),
        clearToken: clearMcpToken,
      }, editingMcpId || undefined);
      setMcpServers((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setMcpTestResults((current) => { const next = { ...current }; delete next[saved.id]; return next; });
      resetMcpForm();
      toast({ title: 'MCP connector saved', description: 'The connector is private to your account.', variant: 'success' });
    } catch (error) {
      toast({ title: 'Could not save connector', description: error instanceof Error ? error.message : 'Check the connector details and try again.', variant: 'destructive' });
    } finally {
      setMcpBusy(null);
    }
  };

  const testMcpServer = async (server: MCPServer) => {
    setMcpBusy(server.id);
    setMcpTestResults((current) => { const next = { ...current }; delete next[server.id]; return next; });
    try {
      const result = await api.testMcpServer(server.id);
      setMcpTestResults((current) => ({ ...current, [server.id]: result }));
      toast({ title: 'MCP connector is reachable', description: `${result.tools.length} tool${result.tools.length === 1 ? '' : 's'} discovered.`, variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not connect to the MCP server.';
      setMcpTestResults((current) => ({ ...current, [server.id]: message }));
      toast({ title: 'MCP connection failed', description: message, variant: 'destructive' });
    } finally {
      setMcpBusy(null);
    }
  };

  const deleteMcpServer = async (server: MCPServer) => {
    setMcpBusy(server.id);
    try {
      await api.deleteMcpServer(server.id);
      setMcpServers((current) => current.filter((item) => item.id !== server.id));
      setMcpTestResults((current) => { const next = { ...current }; delete next[server.id]; return next; });
      if (editingMcpId === server.id) resetMcpForm();
      toast({ title: 'MCP connector removed', description: `${server.name} was removed from your account.`, variant: 'success' });
    } catch {
      toast({ title: 'Could not remove connector', description: 'Try again in a moment.', variant: 'destructive' });
    } finally {
      setMcpBusy(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSaving(true);
    try {
      await api.updateSettings(settings);
      toast({
        title: 'Settings Saved',
        description: 'Autonomy policies and provider parameters updated.',
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) return null;

  return (
    <div className="workspace-page space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-400" />
            <span>Make it yours.</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Saved to your account. Profile and Gemini generation preferences affect assistant responses.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          className="text-xs"
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Save Changes
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'guardrails', label: 'Privacy & control', icon: Shield },
          { id: 'model', label: 'Model', icon: Zap },
          { id: 'user', label: 'Profile', icon: User },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'connectors', label: 'MCP connectors', icon: Server },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/25 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'connectors' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Server className="w-4 h-4 text-sky-400" /> Your MCP connectors</CardTitle>
              <CardDescription>Connect your own remote MCP servers. Credentials are encrypted in the database and are never shown again after saving.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {mcpServers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No personal MCP connectors yet. Add a public HTTPS MCP endpoint below.</div>
              ) : mcpServers.map((server) => {
                const result = mcpTestResults[server.id];
                return (
                  <div key={server.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="font-semibold text-sm text-slate-100">{server.name}</span><Badge variant={server.hasToken ? 'success' : 'default'} size="sm">{server.hasToken ? 'Token saved' : 'No token'}</Badge></div>
                        <p className="text-xs text-slate-400 mt-1 break-all">{server.url}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button type="button" size="sm" variant="outline" onClick={() => testMcpServer(server)} isLoading={mcpBusy === server.id} disabled={mcpBusy !== null}><FlaskConical className="w-3.5 h-3.5" /> Test</Button>
                        <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${server.name}`} disabled={mcpBusy !== null} onClick={() => { setEditingMcpId(server.id); setMcpName(server.name); setMcpUrl(server.url); setMcpToken(''); setClearMcpToken(false); }}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                        <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${server.name}`} disabled={mcpBusy !== null} onClick={() => deleteMcpServer(server)} className="text-slate-400 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /> Remove</Button>
                      </div>
                    </div>
                    {typeof result === 'string' && <p role="alert" className="text-xs text-rose-300">{result}</p>}
                    {typeof result === 'object' && result && (
                      <div className="border-t border-slate-800 pt-3 space-y-2">
                        <p className="text-xs text-emerald-300">Connected · {result.tools.length} tools found</p>
                        {result.tools.length > 0 && <div className="flex flex-wrap gap-2">{result.tools.map((tool) => <span key={tool.name} className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{tool.title} · {tool.readOnly ? 'read only' : 'approval required'}</span>)}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">{editingMcpId ? <Pencil className="w-4 h-4 text-sky-400" /> : <Plus className="w-4 h-4 text-sky-400" />}{editingMcpId ? 'Edit connector' : 'Add a connector'}</CardTitle>
              <CardDescription>Only public HTTPS endpoints are allowed. Local stdio commands stay deployment-managed.</CardDescription>
            </CardHeader>
            <CardContent className="pt-1">
              <form onSubmit={saveMcpServer} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="mcp-name" className="block text-slate-300 font-semibold mb-1 text-xs">Connector name</label>
                    <input id="mcp-name" required pattern="[A-Za-z0-9_-]{1,32}" maxLength={32} value={mcpName} onChange={(event) => setMcpName(event.target.value)} placeholder="e.g. linear" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200" />
                  </div>
                  <div>
                    <label htmlFor="mcp-url" className="block text-slate-300 font-semibold mb-1 text-xs">Remote MCP HTTPS URL</label>
                    <input id="mcp-url" required type="url" value={mcpUrl} onChange={(event) => setMcpUrl(event.target.value)} placeholder="https://mcp.example.com/mcp" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 font-mono" />
                  </div>
                </div>
                <div>
                  <label htmlFor="mcp-token" className="block text-slate-300 font-semibold mb-1 text-xs flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Bearer token <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input id="mcp-token" type="password" autoComplete="new-password" value={mcpToken} onChange={(event) => setMcpToken(event.target.value)} placeholder={editingMcpId ? 'Leave blank to keep the saved token' : 'Paste the token provided by the MCP service'} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 font-mono" />
                  {editingMcpId && mcpServers.find((server) => server.id === editingMcpId)?.hasToken && <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={clearMcpToken} onChange={(event) => setClearMcpToken(event.target.checked)} /> Remove the saved token</label>}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400 flex items-start gap-2"><Shield className="w-4 h-4 text-sky-400 shrink-0" /><span>Each account can access only its own connectors. Bearer tokens are encrypted at rest. Tools marked read/write or unannotated pause for your approval before execution.</span></div>
                <div className="flex justify-end gap-2">
                  {editingMcpId && <Button type="button" variant="ghost" size="sm" onClick={resetMcpForm} disabled={mcpBusy !== null}>Cancel</Button>}
                  <Button type="submit" size="sm" variant="primary" isLoading={mcpBusy === 'save'} disabled={mcpBusy !== null}>{editingMcpId ? 'Save changes' : 'Add connector'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 1: Guardrails & Permissions */}
      {activeTab === 'guardrails' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>How your assistant works</span>
              </CardTitle>
              <CardDescription>
                Determine when the agent can act independently versus pausing for confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: 'strict_approval',
                    title: 'Strict Verification',
                    desc: 'Every scheduled assistant run waits for your approval. Gmail and calendar access remains read-only.',
                  },
                  {
                    id: 'balanced',
                    title: 'Balanced (Recommended)',
                    desc: 'Scheduled runs follow their per-task approval checkbox. Connected Google tools remain read-only.',
                  },
                  {
                    id: 'autonomous_safe',
                    title: 'High Autonomy',
                    desc: 'Scheduled runs can start automatically unless the task asks for approval. Connected Google tools remain read-only.',
                  },
                ].map((level) => {
                  const isSelected = settings.guardrails.autonomyLevel === level.id;
                  return (
                    <button type="button" aria-pressed={isSelected}
                      key={level.id}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          guardrails: { ...settings.guardrails, autonomyLevel: level.id as any },
                        })
                      }
                      className={`p-4 rounded-xl border cursor-pointer transition-all text-left ${
                        isSelected
                          ? 'border-sky-500 bg-sky-950/20 text-white'
                          : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-white">{level.title}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{level.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400">
                Scheduled assistant runs use the approval mode and per task setting above. Gmail drafts can be saved only after approval and are never sent by NexusAI. Calendar write actions, Telegram messages, and browser submissions are not enabled.
              </div>

              {/* Resource Throttling */}
              <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-mono">Max Concurrent Agents</label>
                  <input
                    type="number"
                    value={settings.guardrails.maxConcurrentAgents}
                    disabled
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-500 font-mono disabled:opacity-70"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">The scheduler runs tasks serially.</p>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-mono">Max Tool Rounds / Run</label>
                  <input
                    type="number"
                    value={settings.guardrails.maxToolCallsPerRun}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        guardrails: {
                          ...settings.guardrails,
                          maxToolCallsPerRun: parseInt(e.target.value) || 5,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-mono">Daily Cost Budget ($)</label>
                  <input
                    type="number"
                    value={settings.guardrails.dailyCostBudgetUsd}
                    disabled
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-500 font-mono disabled:opacity-70"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Gemini usage metering is not available in this view.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Model Configuration */}
      {activeTab === 'model' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-sky-400" />
                <span>Foundation Model Routing</span>
              </CardTitle>
              <CardDescription>
                Choose the default orchestrator model and runtime inference parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Primary LLM Provider</label>
                <select
                    value={settings.model.provider}
                  disabled
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  >
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Model Name</label>
                  <input
                    type="text"
                    value={settings.model.modelId}
                    readOnly
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Temperature: {settings.model.temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.model.temperature}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        model: { ...settings.model, temperature: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full accent-sky-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>Deterministic (0.0)</span>
                    <span>Creative (1.0)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Max Output Tokens</label>
                  <input
                    type="number"
                    value={settings.model.maxOutputTokens}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        model: { ...settings.model, maxOutputTokens: parseInt(e.target.value) || 2048 },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Operator Profile */}
      {activeTab === 'user' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              <span>Operator Profile & Tone</span>
            </CardTitle>
            <CardDescription>
              Executive persona context injected into agent conversation prompts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Operator Name</label>
                <input
                  type="text"
                  value={settings.user.name}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      user: { ...settings.user, name: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                />
              </div>

              <div>
                  <label className="block text-slate-300 font-semibold mb-1">Signed-in account</label>
                <input
                  type="email"
                  value={settings.user.email}
                  readOnly
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-400 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Timezone</label>
                <input
                  type="text"
                  value={settings.user.timezone}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      user: { ...settings.user, timezone: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Preferred Communication Style</label>
                <select
                  value={settings.user.preferredTone}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      user: { ...settings.user, preferredTone: e.target.value as any },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                >
                  <option value="executive">Executive (High-level findings, bullet points, zero fluff)</option>
                  <option value="concise">Ultra-Concise (1-2 sentences maximum)</option>
                  <option value="technical">Technical (Includes tool calls, schemas, & timings)</option>
                  <option value="casual">Casual (Conversational & approachable)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Notifications */}
      {activeTab === 'notifications' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-sky-400" />
              <span>Notification Channels & Out-of-Band Alerts</span>
            </CardTitle>
            <CardDescription>
              Configure mobile and email notifications when actions require human approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1 text-xs">
            {[
              { key: 'notifyOnApprovalRequired', label: 'Instant alert when an action requires human approval' },
              { key: 'notifyOnTaskFailure', label: 'Alert when a background scheduled cron fails' },
              { key: 'telegramAlerts', label: 'Push alerts to connected Telegram bot (@NexusChiefOfStaffBot)' },
            ].map((n) => (
              <label
                key={n.key}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer text-slate-300 hover:text-white"
              >
                <input
                  type="checkbox"
                  checked={(settings.notifications as any)[n.key]}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        [n.key]: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500"
                />
                <span>{n.label}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
