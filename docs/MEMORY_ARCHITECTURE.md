# NexusAI Memory Architecture

> **Implementation status (2026-10-07):** The live implementation uses an owner-scoped PostgreSQL `memories` table with JSON tags/metadata and optional `vector(768)` Gemini embeddings. Chat retrieves up to five matching records with in-process cosine/keyword ranking. After a successful, non-paused exchange, Gemini may propose up to three durable user facts or preferences. Candidates are stored separately in `memory_suggestions`, scoped to the signed-in owner, and shown on the Memory page for editing, approval, or dismissal. Nothing becomes a saved memory until the user approves it. Extraction skips exchanges that visibly contain credentials, direct email addresses, or long numeric identifiers and instructs Gemini to exclude sensitive data. Suggestions expire from the pending list after 30 days. Redis caching, HNSW/full-text indexes, and procedural workflows below remain target-design items.

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

After a successful chat run (runs waiting for action approval are skipped):
1. **Candidate extraction**: Gemini receives the latest user and assistant exchange plus existing memories, and may return up to three durable facts or preferences. The extraction prompt treats the exchange as untrusted data and excludes transient requests, assistant claims, secrets, direct contact information, and sensitive personal data.
2. **Duplicate filtering**: Exact title/content matches are discarded. Semantic deduplication and updating existing memories are not implemented yet.
3. **Pending review**: Candidates are stored in `memory_suggestions` with the authenticated owner and conversation ID. They remain pending and visible for 30 days.
4. **User decision**: The Memory page allows title/content edits. Approving creates a user-verified `memories` record with an embedding when available; dismissing removes the candidate from the pending list. Every list and decision query is scoped to the authenticated owner.
5. **No silent writes**: Extraction never writes directly into the durable `memories` table. Candidates are not injected into future chat context until approved.
