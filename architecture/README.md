# NexusAI System Architecture

NexusAI is an autonomous AI Chief of Staff and Agentic Operating System designed for executive-level delegation, cross-service coordination, and autonomous background execution with human-in-the-loop safeguards.

---

## 1. High-Level Architectural Topology

```
+-----------------------------------------------------------------------------------+
|                                 USER INTERFACES                                   |
|   +-----------------------+   +----------------------+   +--------------------+   |
|   |  Next.js 14 Web App   |   |  Telegram Bot (TBD)  |   | Voice Stream (TBD) |   |
|   +-----------+-----------+   +----------+-----------+   +---------+----------+   |
+---------------|--------------------------|-------------------------|--------------+
                | SSE / REST / WebSockets  |                         |
                v                          v                         v
+-----------------------------------------------------------------------------------+
|                        FASTAPI CORE APPLICATION GATEWAY                           |
|  - Auth & Session Management (OAuth2 / JWT)                                      |
|  - REST endpoints for CRUD (Tasks, Memory, Approvals, Integrations)               |
|  - Real-Time Event Streaming (Server-Sent Events: /api/v1/agent/stream)          |
|  - Human-in-the-Loop Interceptor & State Machines                                |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                      LANGGRAPH MULTI-AGENT SUPERVISOR                             |
|                                                                                   |
|                   +----------------------------------+                            |
|                   |    Supervisor / Router Agent     |                            |
|                   |  (Decomposes Goals, Evaluates    |                            |
|                   |   Policy & Dispatches to Subs)   |                            |
|                   +-----------------+----------------+                            |
|                                     |                                             |
|        +------------------+---------+---------+------------------+                |
|        |                  |                   |                  |                |
|        v                  v                   v                  v                |
|  +------------+    +---------------+    +------------+    +---------------+       |
|  | CommsAgent |    | CalendarAgent |    | BrowserAg. |    | MemoryCurator |       |
|  +-----+------+    +-------+-------+    +-----+------+    +-------+-------+       |
+--------|-------------------|------------------|-------------------|---------------+
         |                   |                  |                   |
         +-------------------+--------+---------+-------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                             MCP GATEWAY (CLIENT)                                  |
|   - Tool Discovery & Reflection                                                   |
|   - Dynamic Tool Routing & Capability Sandboxing                                  |
|   - Human-in-the-Loop Interception Check before Execution                         |
+-------------------------------------+---------------------------------------------+
                                      | JSON-RPC 2.0 (stdio / SSE / Stream)
                                      v
+-----------------------------------------------------------------------------------+
|                           MCP SERVER ECOSYSTEM                                    |
|  +---------------+  +---------------+  +---------------+  +--------------------+  |
|  |   mcp-gmail   |  | mcp-calendar  |  | mcp-telegram  |  |   mcp-playwright   |  |
|  | (Draft/Search/|  | (Events/Free- |  | (Messages/    |  | (DOM Nav/Click/    |  |
|  |  Send/Labels) |  |  Busy/Remind) |  |  Channels)    |  |  Extract/Screens)  |  |
|  +-------+-------+  +-------+-------+  +-------+-------+  +---------+----------+  |
+----------|------------------|------------------|--------------------|-------------+
           v                  v                  v                    v
    Google Workspace   Google Calendar    Telegram Bot API       Chromium / Web

+-----------------------------------------------------------------------------------+
|                            STATE & STORAGE TIER                                   |
|  - PostgreSQL 16 + pgvector (Semantic & Episodic Memories, Audit Logs, Runs)      |
|  - Redis 7.2 (Real-Time Pub/Sub, Distributed Locks, Session State, Short Memory)  |
|  - Celery / APScheduler (Background Recurring Tasks & Autonomous Cron Workers)    |
+-----------------------------------------------------------------------------------+
```

---

## 2. Architectural Boundaries & Component Isolation

### 2.1 Frontend / Backend Boundary
- **Transport**: Standard JSON REST APIs for transactional CRUD + Server-Sent Events (`text/event-stream`) for agent execution streaming.
- **Contract Isolation**: The frontend interacts exclusively via `@nexusai/types` interfaces through `lib/api/client.ts`. The UI components never make direct low-level assumptions about database structures or Python internals.
- **Mock Mode**: Built-in mock services implement 100% of the backend interface so UI development, testing, and demos can occur independently of backend readiness.

### 2.2 Agent Orchestration Boundary (LangGraph)
- **Role**: The Supervisor coordinates sub-agents using a deterministic state graph.
- **Safe Output Generation**: Raw chain-of-thought tokens are strictly contained within backend worker nodes. Only structured progress events (`ActivityStep`: `type`, `summary`, `status`, `durationMs`) are emitted across the wire to the frontend.
- **State Checkpointing**: Every step is checkpointed to PostgreSQL so long-running operations survive server restarts or network interruptions.

### 2.3 Model Context Protocol (MCP) Boundary
- The agent core acts as an **MCP Client**.
- Third-party integrations (Gmail, Google Calendar, Telegram, Playwright browser) run as isolated **MCP Servers** exposing standard JSON-RPC 2.0 schemas.
- Adding a new integration requires zero prompt restructuring; the Supervisor reads dynamic tool declarations directly from the MCP Gateway.

### 2.4 Memory Tier Boundary
- **Episodic Memory**: Full transcripts and activity runs saved in PostgreSQL.
- **Semantic Memory**: High-level distilled knowledge, facts, and entities stored in PostgreSQL with `pgvector` HNSW index for cosine distance retrieval.
- **Preferences**: User-specified constraints (e.g., "Never schedule meetings before 10 AM") loaded into the supervisor prompt context.
- **Short-Term Context Cache**: Redis keys with TTL storing conversation scratchpads.

### 2.5 Task Execution Boundary (Scheduler & Workers)
- Scheduled tasks are registered in PostgreSQL with cron syntax or interval specifications.
- Background scheduler (APScheduler / Celery Beat) monitors schedules and dispatches task executions into Celery worker queues.
- Results feed directly into the agent run observability pipeline and notify the user when completed.

### 2.6 Human Approval Boundary (HITL)
- Any tool marked as high-impact (sending emails, deleting calendar events, external messaging, financial actions, unconstrained browser submissions) triggers a `waiting_approval` state.
- The supervisor suspends execution and persists an `ApprovalRequest` record with diffs and rationale.
- The frontend renders an interactive card in the **Approval Center** and the **Main Chat**.
- Execution only resumes when an authenticated approval decision is received.

---

## 3. Directory Layout

```text
NexusAI/
├── apps/
│   └── web/                   # Next.js 14 Web Application (App Router, Tailwind, TypeScript)
├── packages/
│   ├── types/                 # Shared TypeScript interfaces & API contracts
│   ├── ui/                    # Reusable UI component library & tokens
│   └── config/                # ESLint, Tailwind, TSConfig shared configurations
├── architecture/              # High-level architecture documentation & diagrams
│   └── diagrams/
├── docs/                      # Technical specifications & handoff guides
│   ├── API_CONTRACTS.md       # REST & SSE schema specifications for FastAPI
│   ├── AGENT_ARCHITECTURE.md  # LangGraph orchestration & agent patterns
│   ├── MCP_ARCHITECTURE.md    # Model Context Protocol server specifications
│   ├── MEMORY_ARCHITECTURE.md # pgvector schema, retrieval & categorization
│   └── CODEX_BACKEND_HANDOFF.md # Direct implementation roadmap for backend
├── docker/                    # Docker Compose & container configurations
│   ├── docker-compose.yml
│   ├── Dockerfile.web
│   └── Dockerfile.api
└── README.md                  # Project overview & running instructions
```
