# NexusAI: Autonomous AI Chief of Staff & Agentic OS

## Current implementation

The web chat now connects to a FastAPI service with persisted conversations and
Gemini streaming. Gmail, Calendar, Telegram, browser automation, memory, tasks,
approvals, and observability screens remain **interactive previews** and do not
perform real external actions. The older architecture sections below describe the
target design, not implemented backend features.

### Run locally

1. Copy `docker/.env.docker.example` to `docker/.env` and set `GEMINI_API_KEY`.
2. From the repository root, run `docker compose --env-file docker/.env -f docker/docker-compose.yml up --build`.
3. Open `http://localhost:3000`. The API health endpoint is `http://localhost:8000/health`.

The Compose ports bind to your own machine. This development slice has no user
authentication; do not expose it to the public internet. Conversations are stored
in the local PostgreSQL volume. Without a Gemini key, chat returns a clear
configuration error rather than a simulated answer.

> **Phase 1: Monorepo Foundation & Frontend Command Center**  
> Built for developer-grade autonomous agent orchestration, Model Context Protocol (MCP) ecosystems, and human-in-the-loop governance.

---

## 1. Executive Summary & What Was Created

NexusAI is an autonomous AI Chief of Staff and agentic operating system designed to orchestrate high-level delegation across Google Workspace (Gmail, Calendar), Telegram, Headless Chromium (Playwright), and persistent memory stores.

In this foundational phase, we have established:
1. **Production Monorepo Structure**: Full package isolation with `@nexusai/types`, `@nexusai/ui`, `@nexusai/config`, and `apps/web`.
2. **Next.js 14 Web Command Center**: A sleek, dark-mode, developer-centric dashboard designed specifically as an AI command center and observability portal (not a generic chatbot demo).
3. **8 Feature-Complete Interfaces**:
   - **Agent Console (Main Chat)**: Multi-agent message stream, safe progress reasoning accordion without leaking hidden chain-of-thought, tool execution indicators, voice input placeholder, stop/cancel controls, and quick prompt presets.
   - **Live Agent Activity Panel**: Real-time orchestration hierarchy, active task summaries, and step-by-step tool timeline.
   - **Connected Apps (MCP Integrations)**: Cards for Gmail, Google Calendar, Telegram, Playwright Browser, Slack, and Notion with live connection states, scope permissions, and custom MCP registration.
   - **Memory Bank (pgvector)**: Filterable long-term memory across Semantic facts, Preferences & Rules, Episodic recaps, and Procedural SOPs with confidence metrics and search.
   - **Tasks & Scheduled Cron**: Autonomous background routines with cron syntax, interval triggers, priority badges, enable/disable toggles, and creation modal.
   - **Approval Center (Human-in-the-Loop)**: Staged external actions requiring human authorization (Send email, Reschedule calendar, Post message, Browser form submit) with parameter diff viewers and approve/reject feedback loops.
   - **Agent Runs & Observability**: Token economics, cost estimates, P95 latency breakdowns (Planning vs Tool Execution vs Model Inference), error tracking, and full run inspection.
   - **Settings & Guardrails**: Autonomy levels (Strict, Balanced, High Autonomy), tool gating checkboxes, foundation model selection (Gemini 1.5 Pro/Flash, Claude 3.5 Sonnet, GPT-4o, Ollama), user profile, and alerts.
4. **Resilient Service Abstraction (`lib/api/client.ts`)**: Single-point switch between **Mock Mode** (with real-time simulated SSE stream, tool calls, and stateful memory updates) and real **FastAPI Backend**.
5. **Architectural Blueprints & Hand-off Docs**: Mermaid flowcharts, REST & SSE contracts, MCP specifications, pgvector memory schemas, and a step-by-step backend roadmap for Codex.

---

## 2. Monorepo Project Structure

```text
NexusAI/
├── apps/
│   ├── web/                        # Next.js 14 App Router Frontend
│   │   ├── src/
│   │   │   ├── app/                # Next.js Pages (/, /activity, /apps, /memory, /tasks, /approvals, /observability, /settings)
│   │   │   ├── components/         # Modular UI & Feature components
│   │   │   │   ├── chat/           # Chat container, Message bubble, Tool badge, Reasoning summary
│   │   │   │   ├── activity/       # Live activity traces & tree
│   │   │   │   ├── apps/           # MCP cards, connection modal, scopes
│   │   │   │   ├── memory/         # Vector memory table, search, add modal
│   │   │   │   ├── tasks/          # Cron task cards, scheduler modal
│   │   │   │   ├── approvals/      # Human approval cards, diff viewers, decision modals
│   │   │   │   ├── observability/  # KPI cards, runs table, latency breakdowns
│   │   │   │   ├── settings/       # Guardrail controls & model selectors
│   │   │   │   ├── layout/         # Sidebar, Header, Status bars
│   │   │   │   └── shared/         # Button, Badge, Card, Modal, Toast, Skeleton
│   │   │   ├── lib/
│   │   │   │   ├── api/            # API client, Mock state, SSE simulator
│   │   │   │   ├── hooks/          # useToasts, event listeners
│   │   │   │   └── utils.ts        # Formatting & styling helpers
│   │   │   └── types/              # Frontend types
│   │   ├── tailwind.config.js      # Developer-grade dark aesthetic
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── api/                        # <-- CODEX IMPLEMENTS FASTAPI HERE
├── packages/
│   ├── types/                      # Shared TypeScript contracts & schemas
│   │   ├── src/
│   │   │   ├── agent.ts            # Agent & capability models
│   │   │   ├── chat.ts             # Message, ToolCall, ToolResult
│   │   │   ├── activity.ts         # ActivityStep, AgentRun, ExecutionEvent
│   │   │   ├── memory.ts           # Memory categories & search
│   │   │   ├── task.ts             # ScheduledTask & cron interfaces
│   │   │   ├── approval.ts         # ApprovalRequest, diffs, & decisions
│   │   │   ├── integration.ts      # ConnectedApp & MCP scopes
│   │   │   ├── observability.ts    # Token metrics & latency breakdowns
│   │   │   └── settings.ts         # Guardrails & provider config
│   ├── ui/                         # Shared UI tokens
│   └── config/                     # Shared tooling configs
├── architecture/
│   ├── README.md                   # High-level architecture & system boundaries
│   └── diagrams/
│       ├── system-overview.mermaid # Complete end-to-end topology
│       ├── agent-orchestration.mermaid # LangGraph sequence & approval pause
│       ├── mcp-mesh.mermaid        # MCP client-server gateway mesh
│       ├── approval-workflow.mermaid # Human-in-the-loop decision state machine
│       └── memory-flow.mermaid     # Dual-tier pgvector + Redis memory pipeline
├── docs/
│   ├── API_CONTRACTS.md            # Complete REST & SSE specifications for FastAPI
│   ├── MCP_ARCHITECTURE.md         # MCP SDK guidelines, stdio servers, & tool definitions
│   ├── AGENT_ARCHITECTURE.md       # LangGraph supervisor-worker & checkpointing specs
│   ├── MEMORY_ARCHITECTURE.md      # PostgreSQL + pgvector schema & RRF hybrid search
│   └── CODEX_BACKEND_HANDOFF.md    # Actionable backend implementation plan
├── docker/
│   ├── docker-compose.yml          # Postgres 16 (pgvector), Redis 7.2, Web, API
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── .env.docker.example
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 3. How to Run the Frontend

### Prerequisites
- Node.js >= 18 (Tested on Node.js v22.14.0)
- npm or pnpm

### Quick Start
1. Install dependencies (from root):
   ```bash
   npm install
   ```
2. Run development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

The frontend operates in **Mock Mode** by default (`NEXT_PUBLIC_USE_MOCK_API=true`), meaning you can interactively:
- Submit prompts and watch the SSE simulator emit live tool executions and incremental streaming tokens.
- Review and Approve/Reject pending actions in the **Approval Center**.
- Add and delete long-term memories in the **Memory Bank**.
- Toggle and register new scheduled cron tasks in **Tasks**.
- Connect and disconnect MCP integrations in **Connected Apps**.
- Inspect execution latencies and token economics in **Observability**.

---

## 4. Key Architectural Decisions

1. **Strict Chain-of-Thought Encapsulation**:
   Raw LLM scratchpads and internal CoT prompts are NEVER streamed to the UI. Instead, the supervisor emits structured `ExecutionSummaryStep` events (`Understanding request`, `Memory retrieval`, `Gmail search`, `Calendar lookup`, `Final response`) displayed as collapsible, safe progress nodes.
2. **MCP (Model Context Protocol) as the Standard Tool Interface**:
   Instead of ad-hoc python scripts, tools are decoupled into standardized MCP servers. The backend functions as an MCP Client; adding a new capability requires zero changes to the core prompt.
3. **Deterministic Human-in-the-Loop (HITL) Checkpoints**:
   Actions modifying external state (sending emails, modifying calendar events, browser submissions) pause execution via LangGraph checkpoints. The graph state is persisted in PostgreSQL/Redis while awaiting human decision via the web UI.
4. **pgvector + Redis Hybrid Memory**:
   Separated into 4 clear tiers: User Preferences (injected into all prompts), Semantic Knowledge (HNSW vector similarity), Procedural SOPs, and Episodic Execution Logs.
5. **Decoupled API Contract Layer**:
   All frontend services are abstracted in `lib/api/client.ts`. When Codex builds FastAPI, switching `NEXT_PUBLIC_USE_MOCK_API=false` immediately binds the web UI to the real endpoints.

---

## 5. Codex Implementation Guide & Roadmap

Codex should implement the backend in `apps/api` following `docs/CODEX_BACKEND_HANDOFF.md`:

```text
Target Backend Stack:
├── Framework: FastAPI (Async)
├── Multi-Agent: LangGraph + LangChain Core
├── Foundation Models: Google Gemini (gemini-1.5-pro, gemini-1.5-flash via langchain-google-genai)
├── MCP SDK: mcp (Official Python SDK)
├── Database: PostgreSQL 16 + pgvector extension
├── Cache / Locks: Redis 7.2
└── Background Scheduler: APScheduler / Celery
```

### Exact Next Steps for Codex:
1. **Initialize `apps/api`**:
   - Create `pyproject.toml` with `fastapi`, `uvicorn`, `sqlalchemy[asyncio]`, `asyncpg`, `pgvector`, `mcp`, `langgraph`, and `langchain-google-genai`.
2. **Database Models & Migrations**:
   - Implement tables for `memories`, `tasks`, `approvals`, `runs`, and `conversations` matching `docs/API_CONTRACTS.md` and `docs/MEMORY_ARCHITECTURE.md`.
3. **Streaming Endpoint (`POST /api/v1/agent/stream`)**:
   - Implement SSE generator using `StreamingResponse` emitting `run:init`, `step:start`, `tool:start`, `tool:end`, `stream:chunk`, `approval:required`, and `run:complete`.
4. **LangGraph Supervisor Graph**:
   - Construct supervisor router node and worker agents (`comms`, `calendar`, `browser`, `memory`).
   - Wire `PostgresSaver` checkpointer for graph pause/resume.
5. **MCP Client Gateway**:
   - Spawn stdio servers for `mcp-gmail`, `mcp-calendar`, `mcp-telegram`, and `mcp-playwright`.
   - Intercept calls to approval-gated tools and trigger `ApprovalRequest`.
6. **Deploy with Docker**:
   - Launch entire stack using `docker-compose -f docker/docker-compose.yml up`.
