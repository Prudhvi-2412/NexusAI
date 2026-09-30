# NexusAI Memory Architecture

This document specifies the persistent memory architecture for NexusAI, implementing a hybrid semantic, episodic, preference, and procedural storage tier using **PostgreSQL + pgvector** and **Redis**.

---

## 1. Memory Classification Hierarchy

NexusAI categorizes long-term knowledge into four distinct memory tiers:

| Tier | Category | Description | Storage Engine | Query Strategy |
|---|---|---|---|---|
| 1 | **Preferences** | User rules, working habits, constraints (e.g., "No meetings before 10 AM", "Keep emails under 4 sentences"). | Postgres Table + Cached in Redis | Exact key match / Injected into all supervisor prompts |
| 2 | **Semantic** | Distilled facts, entities, company contacts, and contextual knowledge. | Postgres `pgvector` (HNSW) | Cosine vector similarity + Full-text BM25 |
| 3 | **Episodic** | Historical task execution narratives, transcripts, and retrospective logs. | Postgres partitioned by date | Temporal range + semantic search |
| 4 | **Procedural** | Step-by-step SOPs (e.g., "How to prepare the weekly executive board report"). | Postgres + pgvector | Task classification similarity |

---

## 2. PostgreSQL + pgvector Schema

```sql
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Memory Category Enum
CREATE TYPE memory_category AS ENUM ('semantic', 'preference', 'episodic', 'procedural');
CREATE TYPE memory_source AS ENUM ('chat', 'email', 'calendar', 'task_result', 'user_manual');

-- Core Memories Table
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category memory_category NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    source memory_source NOT NULL DEFAULT 'chat',
    confidence FLOAT NOT NULL DEFAULT 1.0,
    tags TEXT[] NOT NULL DEFAULT '{}',
    access_count INT NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Embedding vector (e.g. 1536-dim for OpenAI or 768-dim for Gemini embeddings)
    embedding vector(768),
    
    -- Metadata (source IDs, timestamps, user verification status)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast Cosine Similarity HNSW Index
CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Text search index for hybrid retrieval
CREATE INDEX idx_memories_tsv ON memories USING gin(to_tsvector('english', title || ' ' || content));
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_tags ON memories USING gin(tags);
```

---

## 3. Hybrid Retrieval Algorithm

At the start of every user request:
1. **Dense Vector Search**:
   Convert the user's prompt into an embedding `Q`.
   ```sql
   SELECT id, category, title, content, confidence,
          1 - (embedding <=> :query_vector) AS similarity
   FROM memories
   WHERE category IN ('semantic', 'procedural')
   ORDER BY embedding <=> :query_vector ASC
   LIMIT 10;
   ```
2. **Preference Injection**:
   All active user preferences are fetched and merged into the system prompt.
3. **Reciprocal Rank Fusion (RRF)**:
   Scores from dense vector cosine similarity and full-text keyword search are blended to prioritize both exact entity matches and conceptual relevance.

---

## 4. Redis Short-Term Context Cache

Redis 7.2 maintains volatile and high-speed operational data:
- `session:{conv_id}:scratchpad` (TTL: 1 hour) — intermediate agent scratchpads.
- `agent:lock:{resource_id}` — distributed locks preventing two background tasks from modifying the same calendar slot simultaneously.
- `cache:preferences:{user_id}` — in-memory cache of user constraints, invalidated on preference update.

---

## 5. Memory Curation & Distillation Pipeline

At the conclusion of each agent run:
1. **Background Job**: The `MemoryCurator` evaluates conversation exchanges.
2. **Extraction**: Detects if new facts, rules, or preferences were stated (e.g., "From now on, BCC my assistant on client emails").
3. **Deduplication**: Queries existing memories with similarity threshold > 0.88. If a match is found, it updates the existing record rather than creating a duplicate.
4. **User Verification**: High-impact rules can be marked `verified_by_user = false` until confirmed via the web UI Memory page.
