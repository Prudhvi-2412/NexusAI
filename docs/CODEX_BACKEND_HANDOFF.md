# NexusAI Backend Implementation Handoff Guide for Codex

> Historical target design: the first FastAPI and Gemini chat slice is now implemented in `apps/api`.
> This document describes future integrations and is not a description of live features.

Welcome Codex! The frontend, TypeScript contracts, UI components, mock services, and architectural specifications for **NexusAI** are fully established.

This document guides your implementation of the production FastAPI backend without restructuring the monorepo.

---

## 1. Backend Project Location & Target Structure

Create the backend service in `apps/api`:

```text
NexusAI/
├── apps/
│   ├── web/                    # Next.js Frontend (Already complete & functional)
│   └── api/                    # <-- CODEX BUILDS THIS
│       ├── pyproject.toml      # Poetry / UV / PDM / pip requirements
│       ├── Dockerfile
│       └── app/
│           ├── main.py         # FastAPI application entrypoint with CORS & lifespan
│           ├── core/
│           │   ├── config.py   # Pydantic Settings (DB URLs, Gemini API keys, Redis)
│           │   ├── security.py # JWT / Auth verification
│           │   └── database.py # SQLAlchemy 2.0 AsyncEngine & sessionmaker
│           ├── api/
│           │   └── v1/
│           │       ├── router.py
│           │       ├── endpoints/
│           │       │   ├── agent.py       # POST /agent/stream (SSE)
│           │       │   ├── conversations.py # REST endpoints
│           │       │   ├── approvals.py   # Human approval state endpoints
│           │       │   ├── memories.py    # pgvector search & CRUD
│           │       │   ├── tasks.py       # Background task CRUD & execution
│           │       │   ├── integrations.py# MCP connected apps status
│           │       │   ├── observability.py # Execution traces & metrics
│           │       │   └── settings.py    # Guardrails & provider config
│           ├── agents/
│           │   ├── state.py    # NexusState TypedDict definition
│           │   ├── graph.py    # LangGraph StateGraph & compiled runner
│           │   ├── supervisor.py# Routing & intent decomposition
│           │   ├── workers/
│           │   │   ├── comms.py
│           │   │   ├── calendar.py
│           │   │   ├── browser.py
│           │   │   └── memory.py
│           │   └── interceptor.py # Human-in-the-loop approval gate
│           ├── mcp/
│           │   ├── manager.py  # Python MCP SDK Client manager
│           │   └── servers/    # MCP stdio or SSE server runners
│           │       ├── gmail_server.py
│           │       ├── calendar_server.py
│           │       ├── telegram_server.py
│           │       └── playwright_server.py
│           ├── models/         # SQLAlchemy DB Models (Memories, Runs, Approvals, Tasks)
│           ├── schemas/        # Pydantic schemas mirroring @nexusai/types
│           └── services/
│               ├── memory_service.py # pgvector cosine similarity & RRF search
│               ├── scheduler.py     # APScheduler / Celery task runner
│               └── sse_service.py   # Event generator for StreamingResponse
```

---

## 2. Environment Variables Contract

The frontend expects the API at `http://localhost:8000`. The backend should read from `.env`:

```bash
# Core API
API_HOST=0.0.0.0
API_PORT=8000
ENVIRONMENT=development
CORS_ORIGINS=["http://localhost:3000"]

# LLM Providers
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.6-flash"
GEMINI_FALLBACK_MODEL="gemini-3.5-flash-lite"

# Database & Vector Store
DATABASE_URL="postgresql+asyncpg://nexus:nexus_secret@localhost:5432/nexusai"
REDIS_URL="redis://localhost:6379/0"

# Google Workspace (OAuth / Service Account)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:8000/api/v1/integrations/google/callback"

# Telegram Bot
TELEGRAM_BOT_TOKEN=""

# Security / JWT
SECRET_KEY="generate-a-strong-secret-key"
ALGORITHM="HS256"
```

---

## 3. Implementation Step-by-Step Priority

### Phase 1: Core REST & Database
1. Set up `apps/api/pyproject.toml` with `fastapi`, `uvicorn`, `sqlalchemy[asyncio]`, `asyncpg`, `pgvector`, `pydantic-settings`, `sse-starlette`.
2. Implement database models matching `docs/API_CONTRACTS.md` & `docs/MEMORY_ARCHITECTURE.md`.
3. Create Alembic migration scripts.
4. Implement CRUD endpoints for `/api/v1/memories`, `/api/v1/tasks`, `/api/v1/approvals`, and `/api/v1/integrations`.

### Phase 2: LangGraph Supervisor & Agent Engine
1. Install `langgraph`, `langchain-google-genai`, `langchain-core`.
2. Define `NexusState` and compile `StateGraph`.
3. Implement `POST /api/v1/agent/stream` using FastAPI `StreamingResponse(sse_generator(), media_type="text/event-stream")`.
4. Ensure safe progress summaries are emitted and raw chain-of-thought is never leaked.

### Phase 3: Model Context Protocol (MCP) Integration
1. Install `mcp` (Official Python Model Context Protocol SDK).
2. Implement MCP client in `apps/api/app/mcp/manager.py`.
3. Connect stdio servers:
   - Gmail tools
   - Google Calendar tools
   - Telegram tools
   - Playwright browser automation
4. Enforce the Human-in-the-Loop interceptor: when high-impact tools are invoked, checkpoint the graph and emit `approval:required`.

### Phase 4: Long-Term Memory with pgvector
1. Implement embedding generation for memories using `text-embedding-004` (Gemini) or `text-embedding-3-small`.
2. Implement hybrid search blending vector distance + BM25 keyword matching.
3. Automatically distill conversation takeaways into the `memories` table after each completed run.

### Phase 5: Autonomous Scheduler
1. Wire APScheduler or Celery Beat to read enabled `ScheduledTask` records.
2. Trigger agent runs automatically at scheduled cron intervals.
3. Report run results to the observability endpoints.

---

## 4. Frontend Integration Switch

When you are ready to switch the frontend from mock mode to your real FastAPI backend, simply change the environment variable in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_USE_MOCK_API=false
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The frontend client in `apps/web/lib/api/client.ts` will immediately route all requests to your FastAPI endpoints.
