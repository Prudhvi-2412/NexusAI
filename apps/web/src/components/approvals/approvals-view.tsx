'use client';

import React, { useState, useEffect } from 'react';
import { ApprovalRequest, ApprovalImpact, ApprovalStatus } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Modal } from '@/components/shared/modal';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Calendar,
  Send,
  Globe,
  AlertTriangle,
  ArrowRight,
  Terminal,
  Cpu,
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { toast } from '@/lib/hooks/use-toast';

export function ApprovalsView() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [activeTab, setActiveTab] = useState<string>('pending');
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    api.getApprovals().then(setApprovals);
  }, []);

  const handleOpenActionModal = (approval: ApprovalRequest, type: 'approve' | 'reject') => {
    setSelectedApproval(approval);
    setActionType(type);
    setNotes('');
  };

  const handleConfirmDecision = async () => {
    if (!selectedApproval || !actionType) return;

    setIsProcessing(true);
    try {
      const updated = await api.submitApprovalDecision({
        requestId: selectedApproval.id,
        decision: actionType,
        notes,
      });

      setApprovals((prev) =>
        prev.map((a) => (a.id === selectedApproval.id ? { ...a, ...updated } : a))
      );

      toast({
        title: actionType === 'approve' ? 'Action Approved' : 'Action Rejected',
        description:
          actionType === 'approve'
            ? (selectedApproval.actionPayload.action === 'run_scheduled_task' ? 'The saved read-only assistant run has been started.' : selectedApproval.actionPayload.action === 'gmail_draft' ? (updated.decisionNotes || 'Gmail draft saved. NexusAI did not send it.') : selectedApproval.actionPayload.action === 'mcp_tool' ? (updated.decisionNotes || 'The approved connector action was processed.') : 'The decision was recorded.')
            : 'The request was declined and the decision was recorded.',
        variant: actionType === 'approve' ? 'success' : 'default',
      });
      setSelectedApproval(null);
      setActionType(null);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to record approval decision.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredApprovals = approvals.filter((a) => {
    if (activeTab === 'all') return true;
    return a.status === activeTab;
  });

  const getImpactBadge = (impact: ApprovalImpact) => {
    switch (impact) {
      case 'critical':
        return <Badge variant="destructive">CRITICAL IMPACT</Badge>;
      case 'high':
        return <Badge variant="warning">HIGH IMPACT</Badge>;
      case 'medium':
        return <Badge variant="info">MEDIUM IMPACT</Badge>;
      default:
        return <Badge variant="default">LOW IMPACT</Badge>;
    }
  };

  const getServiceIcon = (service: string) => {
    switch (service) {
      case 'gmail':
        return <Mail className="w-4 h-4 text-rose-400" />;
      case 'calendar':
        return <Calendar className="w-4 h-4 text-sky-400" />;
      case 'telegram':
        return <Send className="w-4 h-4 text-blue-400" />;
      case 'browser':
        return <Globe className="w-4 h-4 text-emerald-400" />;
      default:
        return <Terminal className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="workspace-page space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <span>You’re in control.</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Review scheduled runs and connector actions. Connector writes remain paused until you approve the exact request.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
          {['pending', 'approved', 'rejected', 'all'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-all ${
                activeTab === tab
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Approval List */}
      <div className="space-y-4">
        {filteredApprovals.length === 0 ? (
          <div className="p-12 text-center text-slate-500 border border-slate-800/80 rounded-xl bg-slate-900/30 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto" />
            <p className="text-sm font-medium text-slate-300">All Clear</p>
            <p className="text-xs text-slate-500">
              No approval requests matching the current filter.
            </p>
          </div>
        ) : (
          filteredApprovals.map((req) => {
            const isPending = req.status === 'pending';

            return (
              <Card
                key={req.id}
                className={`bg-slate-900/60 transition-all ${
                  isPending ? 'border-amber-500/30 shadow-lg shadow-amber-500/5' : 'border-slate-800'
                }`}
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getImpactBadge(req.impact)}
                      <span className="flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {getServiceIcon(req.actionPayload.service)}
                        <span className="uppercase">{req.actionPayload.service}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Requested {formatTimeAgo(req.requestedAt)}</span>
                    </div>
                  </div>

                  <CardTitle className="text-base mt-2 text-slate-100 flex items-center justify-between">
                    <span>{req.title}</span>
                    <span className="text-xs font-mono text-slate-400 font-normal">
                      Initiator: <strong className="text-sky-400">{req.agentName}</strong>
                    </span>
                  </CardTitle>
                  <CardDescription className="text-slate-300">
                    {req.explanation}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Action Payload Preview / Diff Box */}
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-xs font-mono space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="uppercase text-slate-500 font-semibold tracking-wider">
                        Action Target & Parameters
                      </span>
                      <span className="text-sky-400 truncate max-w-xs">{req.actionPayload.target}</span>
                    </div>

                    {req.actionPayload.diff ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {req.actionPayload.diff.before && (
                          <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/20 text-rose-200">
                            <span className="text-[10px] uppercase font-bold text-rose-400 block mb-1">
                              Current / Before
                            </span>
                            <pre className="text-[11px] whitespace-pre-wrap">
                              {JSON.stringify(req.actionPayload.diff.before, null, 2)}
                            </pre>
                          </div>
                        )}
                        {req.actionPayload.diff.after && (
                          <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/20 text-emerald-200">
                            <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
                              Proposed / After
                            </span>
                            <pre className="text-[11px] whitespace-pre-wrap">
                              {JSON.stringify(req.actionPayload.diff.after, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre className="p-2 rounded bg-slate-900 text-slate-300 overflow-x-auto text-[11px]">
                        {JSON.stringify(req.actionPayload.parameters, null, 2)}
                      </pre>
                    )}
                  </div>

                  {/* Decision Audit Log if already decided */}
                  {!isPending && (
                    <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        {req.status === 'approved' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        )}
                        <span className="text-slate-200">
                          {req.status === 'approved' ? 'Approved by' : 'Rejected by'} {req.decidedBy}
                        </span>
                      </div>
                      <span className="text-slate-400 text-[11px]">{req.decisionNotes}</span>
                    </div>
                  )}
                </CardContent>

                {/* Footer Buttons */}
                {isPending && (
                  <CardFooter className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleOpenActionModal(req, 'reject')}
                      className="text-xs"
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      Reject Action
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleOpenActionModal(req, 'approve')}
                      className="text-xs"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Approve & Execute
                    </Button>
                  </CardFooter>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Decision Modal */}
      {selectedApproval && actionType && (
        <Modal
          isOpen={!!selectedApproval}
          onClose={() => {
            setSelectedApproval(null);
            setActionType(null);
          }}
          title={actionType === 'approve' ? 'Authorize Agent Action' : 'Reject Agent Action'}
          description={
            actionType === 'approve'
              ? (selectedApproval.actionPayload.action === 'run_scheduled_task' ? 'Approving starts this saved read-only assistant run now.' : selectedApproval.actionPayload.action === 'gmail_draft' ? 'Approving saves the exact message to your Gmail Drafts folder. NexusAI will not send it.' : selectedApproval.actionPayload.action === 'mcp_tool' ? 'Approving resumes the paused workflow and runs this configured connector tool once.' : 'This records your approval for the requested action.')
              : 'This records that you declined the request.'
          }
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[11px]">Target Action</span>
              <p className="font-semibold text-white">{selectedApproval.title}</p>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {actionType === 'approve' ? 'Execution Notes (Optional)' : 'Rejection Reason / Guidance'}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  actionType === 'approve'
                    ? 'e.g. Approved. Proceed with calendar adjustment.'
                    : 'e.g. Do not reschedule for Friday; check Monday morning slots instead.'
                }
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 resize-none font-sans"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedApproval(null);
                  setActionType(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant={actionType === 'approve' ? 'primary' : 'destructive'}
                isLoading={isProcessing}
                onClick={handleConfirmDecision}
              >
                {actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
