'use client';

import React, { useState, useEffect } from 'react';
import { SystemSettings, ModelProvider } from '@/lib/api/types';
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
} from 'lucide-react';
import { toast } from '@/lib/hooks/use-toast';

export function SettingsView() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'model' | 'guardrails' | 'user' | 'notifications'>('guardrails');

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-400" />
            <span>NexusAI System Configuration & Guardrails</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure agent autonomy boundaries, foundation models, and executive preferences.
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
          { id: 'guardrails', label: 'Agent Autonomy & Guardrails', icon: Shield },
          { id: 'model', label: 'Model Provider & LLMs', icon: Zap },
          { id: 'user', label: 'Operator Profile', icon: User },
          { id: 'notifications', label: 'Alerts & Notifications', icon: Bell },
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

      {/* Tab 1: Guardrails & Permissions */}
      {activeTab === 'guardrails' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Autonomy & Human-in-the-Loop Mode</span>
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
                    desc: 'Every tool execution requiring external network access or data alteration requires manual sign-off.',
                  },
                  {
                    id: 'balanced',
                    title: 'Balanced (Recommended)',
                    desc: 'Safe reads and lookups execute autonomously; external communications and schedule alterations require approval.',
                  },
                  {
                    id: 'autonomous_safe',
                    title: 'High Autonomy',
                    desc: 'Standard emails and calendar events execute autonomously; only critical deletions require approval.',
                  },
                ].map((level) => {
                  const isSelected = settings.guardrails.autonomyLevel === level.id;
                  return (
                    <div
                      key={level.id}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          guardrails: { ...settings.guardrails, autonomyLevel: level.id as any },
                        })
                      }
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
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
                    </div>
                  );
                })}
              </div>

              {/* Individual Tool Gating Checkboxes */}
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-200">Mandatory Human Approvals</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {[
                    { key: 'requireApprovalForEmailSend', label: 'External Email Transmissions (Gmail)' },
                    { key: 'requireApprovalForCalendarCreate', label: 'Calendar Event Additions & Moves' },
                    { key: 'requireApprovalForTelegramSend', label: 'Telegram Direct Messages & Announcements' },
                    { key: 'requireApprovalForBrowserActions', label: 'Playwright Form Fills & Submissions' },
                    { key: 'requireApprovalForFinancials', label: 'Financial or Budgetary Changes' },
                  ].map((chk) => (
                    <label
                      key={chk.key}
                      className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer text-slate-300 hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={(settings.guardrails as any)[chk.key]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            guardrails: {
                              ...settings.guardrails,
                              [chk.key]: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span>{chk.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Resource Throttling */}
              <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-mono">Max Concurrent Agents</label>
                  <input
                    type="number"
                    value={settings.guardrails.maxConcurrentAgents}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        guardrails: {
                          ...settings.guardrails,
                          maxConcurrentAgents: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-mono">Max Tool Calls / Run</label>
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
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        guardrails: {
                          ...settings.guardrails,
                          dailyCostBudgetUsd: parseFloat(e.target.value) || 5.0,
                        },
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
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        model: { ...settings.model, provider: e.target.value as ModelProvider },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  >
                    <option value="gemini">Google Gemini (Gemini 1.5 Pro / Flash)</option>
                    <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                    <option value="openai">OpenAI (GPT-4o)</option>
                    <option value="ollama_local">Ollama Local (Llama 3.1 70B)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Model Name</label>
                  <input
                    type="text"
                    value={settings.model.modelId}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        model: { ...settings.model, modelId: e.target.value },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
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
                <label className="block text-slate-300 font-semibold mb-1">Work Email</label>
                <input
                  type="email"
                  value={settings.user.email}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      user: { ...settings.user, email: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono"
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
              { key: 'emailAlerts', label: 'Send urgent email notifications for critical approvals' },
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
