'use client';

import React, { useState, useEffect } from 'react';
import { ScheduledTask, TaskStatus, CreateTaskPayload } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Modal } from '@/components/shared/modal';
import {
  CalendarCheck,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Terminal,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Cpu,
} from 'lucide-react';
import { toast } from '@/lib/hooks/use-toast';

export function TasksView() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAgentId, setNewAgentId] = useState('agent_supervisor');
  const [newCron, setNewCron] = useState('0 8 * * 1-5');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [newApproval, setNewApproval] = useState(false);

  useEffect(() => {
    api.getTasks().then(setTasks);
  }, []);

  const handleToggleTask = async (task: ScheduledTask) => {
    const updated = await api.toggleTask(task.id, !task.enabled);
    if (updated) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, enabled: !task.enabled, status: !task.enabled ? 'scheduled' : 'paused' } : t)));
      toast({
        title: updated.enabled ? 'Task Activated' : 'Task Paused',
        description: `"${task.title}" cron schedule updated.`,
        variant: updated.enabled ? 'success' : 'default',
      });
    }
  };

  const handleDeleteTask = async (id: string, title: string) => {
    await api.deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast({
      title: 'Task Removed',
      description: `"${title}" has been deleted from scheduler.`,
      variant: 'default',
    });
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    try {
      const created = await api.createTask({
        title: newTitle,
        description: newDescription,
        assignedAgentId: newAgentId,
        cronExpression: newCron,
        priority: newPriority,
        requiresHumanApproval: newApproval,
        targetMcpServers: ['mcp-gmail', 'mcp-calendar'],
      });
      setTasks((prev) => [created, ...prev]);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      toast({
        title: 'Task Scheduled',
        description: 'Autonomous worker registered with APScheduler daemon.',
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to register scheduled task.',
        variant: 'destructive',
      });
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (activeTab === 'all') return true;
    return t.status === activeTab;
  });

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'running':
        return <Badge variant="info">RUNNING</Badge>;
      case 'scheduled':
        return <Badge variant="success">SCHEDULED</Badge>;
      case 'completed':
        return <Badge variant="default">COMPLETED</Badge>;
      case 'failed':
        return <Badge variant="destructive">FAILED</Badge>;
      case 'paused':
        return <Badge variant="warning">PAUSED</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-sky-400" />
            <span>Autonomous Tasks & Scheduled Cron</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Background workers, recurring routines, and event-driven autonomous tasks.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => setIsCreateModalOpen(true)}
          className="text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Create Scheduled Task
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs w-full sm:w-auto">
        {['all', 'scheduled', 'running', 'completed', 'failed'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-all ${
              activeTab === tab
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Task Cards */}
      <div className="space-y-4">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center text-slate-500 border border-slate-800/80 rounded-xl bg-slate-900/30 space-y-2">
            <Clock className="w-8 h-8 text-slate-700 mx-auto" />
            <p className="text-sm font-medium text-slate-400">No Tasks in this Filter</p>
            <p className="text-xs text-slate-500">
              Create a new autonomous task or switch to another view.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <Card
              key={task.id}
              className="bg-slate-900/50 hover:border-slate-700/80 transition-all"
            >
              <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 max-w-2xl min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(task.status)}
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {task.schedule.cronExpression || `Every ${task.schedule.intervalMinutes}m`}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 font-bold">
                      {task.priority} Priority
                    </span>
                    {task.requiresHumanApproval && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                        <ShieldAlert className="w-3 h-3" />
                        HITL Gated
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-slate-100 tracking-tight">
                    {task.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {task.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
                    <span className="flex items-center gap-1.5 text-sky-400">
                      <Cpu className="w-3.5 h-3.5" />
                      {task.assignedAgentName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      Next: {new Date(task.schedule.nextExecutionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </span>
                    {task.targetMcpServers && (
                      <span className="text-slate-500">
                        MCP: {task.targetMcpServers.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Action Controls */}
                <div className="flex items-center gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                  {/* Enable / Disable Toggle */}
                  <button
                    onClick={() => handleToggleTask(task)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-xs text-slate-200 transition-all"
                  >
                    {task.enabled ? (
                      <>
                        <ToggleRight className="w-4 h-4 text-emerald-400" />
                        <span>Enabled</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-4 h-4 text-slate-500" />
                        <span>Disabled</span>
                      </>
                    )}
                  </button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      toast({
                        title: 'Dispatched Immediate Run',
                        description: `Worker spawned for "${task.title}".`,
                        variant: 'info',
                      });
                    }}
                    className="text-xs"
                  >
                    <Play className="w-3.5 h-3.5 mr-1 text-sky-400" />
                    Run Now
                  </Button>

                  <button
                    onClick={() => handleDeleteTask(task.id, task.title)}
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                    title="Delete Task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Task Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Schedule Autonomous Task"
        description="Register an autonomous routine to be dispatched by Celery / APScheduler."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Task Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Daily VIP Email & Calendar Audit"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Description & Directive</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Detailed instructions for the autonomous agent when this task fires..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 resize-none font-sans"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Assigned Agent</label>
              <select
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="agent_supervisor">Nexus Supervisor (Coordinator)</option>
                <option value="agent_comms">Comms Agent (Email & Telegram)</option>
                <option value="agent_calendar">Calendar Agent (Scheduling)</option>
                <option value="agent_browser">Browser Agent (Playwright)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Cron Expression</label>
              <input
                type="text"
                value={newCron}
                onChange={(e) => setNewCron(e.target.value)}
                placeholder="0 8 * * 1-5"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="critical">Critical Priority</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="approval_chk"
                checked={newApproval}
                onChange={(e) => setNewApproval(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-sky-500 focus:ring-sky-500"
              />
              <label htmlFor="approval_chk" className="text-slate-300 cursor-pointer">
                Require human approval before external mutations
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button size="sm" variant="ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Register Task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
