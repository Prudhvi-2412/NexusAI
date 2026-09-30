'use client';

import React, { useState, useEffect } from 'react';
import { Memory, MemoryCategory } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/card';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Modal } from '@/components/shared/modal';
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Pin,
  CheckCircle2,
  Tag,
  Clock,
  Sparkles,
  Database,
  Filter,
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { toast } from '@/lib/hooks/use-toast';

export function MemoryView() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New memory form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preference');
  const [newTags, setNewTags] = useState('');

  const loadMemories = () => {
    api.getMemories({
      category: activeCategory as any,
      query: searchQuery || undefined,
    }).then(setMemories);
  };

  useEffect(() => {
    loadMemories();
  }, [activeCategory, searchQuery]);

  const handleDelete = async (id: string, title: string) => {
    setDeletingId(id);
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast({
        title: 'Memory Deleted',
        description: `"${title}" has been purged from pgvector.`,
        variant: 'default',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete memory item.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    try {
      const created = await api.createMemory({
        title: newTitle,
        content: newContent,
        category: newCategory,
        tags: newTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        confidence: 1.0,
      });
      setMemories((prev) => [created, ...prev]);
      setIsAddModalOpen(false);
      setNewTitle('');
      setNewContent('');
      setNewTags('');
      toast({
        title: 'Memory Saved & Embedded',
        description: 'Vector embeddings generated and stored into HNSW index.',
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Creation Failed',
        description: 'Could not write memory record to database.',
        variant: 'destructive',
      });
    }
  };

  const categories = [
    { id: 'all', label: 'All Memories' },
    { id: 'preference', label: 'Preferences & Rules' },
    { id: 'semantic', label: 'Semantic Facts' },
    { id: 'episodic', label: 'Episodic Recaps' },
    { id: 'procedural', label: 'Procedural SOPs' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-400" />
            <span>Persistent Long-Term Memory (pgvector)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Vectorized context, executive constraints, and learned facts injected into the supervisor.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => setIsAddModalOpen(true)}
          className="text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Memory Rule
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs w-full sm:w-auto">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeCategory === c.id
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vectors & tags..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 font-mono"
          />
        </div>
      </div>

      {/* Memory Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {memories.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 space-y-2">
            <Database className="w-8 h-8 text-slate-700 mx-auto" />
            <p className="text-sm font-medium text-slate-400">No Memories Found</p>
            <p className="text-xs text-slate-500">
              Try adjusting your search query or add a new verified memory rule.
            </p>
          </div>
        ) : (
          memories.map((mem) => {
            const isDeleting = deletingId === mem.id;

            return (
              <Card
                key={mem.id}
                className="flex flex-col justify-between hover:border-slate-700/80 transition-all bg-slate-900/50"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          mem.category === 'preference'
                            ? 'purple'
                            : mem.category === 'semantic'
                            ? 'info'
                            : mem.category === 'episodic'
                            ? 'warning'
                            : 'default'
                        }
                        size="sm"
                      >
                        {mem.category.toUpperCase()}
                      </Badge>
                      {mem.pinned && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono font-semibold">
                          <Pin className="w-3 h-3" />
                          Pinned
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleDelete(mem.id, mem.title)}
                      disabled={isDeleting}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      title="Delete Memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <CardTitle className="text-sm mt-2 text-slate-100">{mem.title}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {mem.content}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {mem.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 font-mono"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* Metadata Footer */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Accessed {mem.accessCount}x ({formatTimeAgo(mem.lastAccessedAt)})
                    </span>
                    <span className="text-emerald-400">
                      {(mem.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add Memory Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Verified Memory Rule"
        description="Insert facts, working habits, or constraints into the agent's long-term vector memory."
        maxWidth="md"
      >
        <form onSubmit={handleCreateMemory} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Title / Headline</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Mandatory 15-minute meeting buffer"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Memory Tier</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="preference">Preference (User Rule / Constraint)</option>
              <option value="semantic">Semantic Fact (Entity, Contact, Knowledge)</option>
              <option value="procedural">Procedural SOP (Step-by-step workflow)</option>
              <option value="episodic">Episodic (Historical interaction)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Knowledge Content</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Provide exact instructions, facts, or constraints..."
              rows={4}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 resize-none font-sans"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Tags (Comma-separated)</label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="calendar, executive, rules"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Save Memory
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
