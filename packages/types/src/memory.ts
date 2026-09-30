export type MemoryCategory = 'semantic' | 'preference' | 'episodic' | 'procedural';

export interface Memory {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  source: 'chat' | 'email' | 'calendar' | 'task_result' | 'user_manual';
  confidence: number; // 0.0 to 1.0
  tags: string[];
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  metadata?: {
    vectorId?: string;
    conversationId?: string;
    externalId?: string;
    verifiedByUser?: boolean;
  };
}

export interface MemorySearchParams {
  query?: string;
  category?: MemoryCategory | 'all';
  tags?: string[];
  limit?: number;
  offset?: number;
}
