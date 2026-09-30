# NexusAI Backend API Contracts

This document specifies the exact REST and Server-Sent Events (SSE) contracts expected by the NexusAI frontend. The backend will be implemented in **FastAPI** by Codex.

Base URL: `/api/v1`

---

## 1. Authentication & Security
- Standard Bearer JWT token in `Authorization: Bearer <token>` header.
- For local development / Mock Mode: Authentication is bypassed or uses a dummy developer header (`X-Nexus-Dev-User: default`).

---

## 2. Server-Sent Events (SSE) Agent Streaming

### `POST /api/v1/agent/stream`
Initiates or continues an agent run. The server returns a stream of events using `text/event-stream`.

#### Request Body (`application/json`)
```json
{
  "conversationId": "conv_12345",
  "message": "Summarize my unread emails from the board and schedule a prep call for tomorrow afternoon.",
  "agentId": "supervisor_01",
  "model": "gemini-3.8-flash",
  "attachments": []
}
```

#### Event Stream Protocol (`text/event-stream`)
Each event contains `event: <type>` and `data: <JSON>`:

```text
event: run:init
data: {"runId": "run_987", "agentName": "Supervisor Agent", "taskTitle": "Process board emails & schedule prep", "status": "running", "timestamp": "2026-09-30T22:00:00Z"}

event: step:start
data: {"stepId": "step_1", "type": "memory_retrieval", "agentName": "MemoryCurator", "summary": "Retrieving board member email preferences", "status": "active", "timestamp": "2026-09-30T22:00:01Z"}

event: step:complete
data: {"stepId": "step_1", "type": "memory_retrieval", "agentName": "MemoryCurator", "summary": "Retrieved 3 preference records", "status": "completed", "durationMs": 350, "timestamp": "2026-09-30T22:00:01Z"}

event: tool:start
data: {"toolCallId": "tc_001", "name": "gmail_search", "server": "mcp-gmail", "input": {"query": "label:unread from:board"}, "status": "executing", "startedAt": "2026-09-30T22:00:02Z"}

event: tool:end
data: {"toolCallId": "tc_001", "name": "gmail_search", "result": {"threadsFound": 2, "snippets": ["Q3 Financial update approved..."]}, "status": "success", "durationMs": 620}

event: stream:chunk
data: {"delta": "I reviewed the 2 unread emails from your board members. Both confirmed the Q3 budget.", "messageId": "msg_456"}

event: approval:required
data: {"requestId": "appr_789", "runId": "run_987", "title": "Send Calendar Invitation", "impact": "medium", "service": "calendar", "action": "create_event", "parameters": {"title": "Board Prep Sync", "start": "2026-10-01T14:00:00", "end": "2026-10-01T14:45:00", "attendees": ["chair@board.org"]}}

event: run:complete
data: {"runId": "run_987", "status": "completed", "durationMs": 2850, "tokenUsage": {"promptTokens": 1420, "completionTokens": 380, "totalTokens": 1800, "estimatedCostUsd": 0.0074}}
```

#### Error Event
```text
event: run:error
data: {"runId": "run_987", "error": "MCP Server 'mcp-calendar' connection timed out", "stepId": "step_2"}
```

---

## 3. Conversations & Messages API

### `GET /api/v1/conversations`
List recent conversations.
- Query params: `limit` (default: 20), `offset` (default: 0)
- Returns: `Conversation[]`

### `POST /api/v1/conversations`
Create a new conversation session.
- Returns: `Conversation`

### `GET /api/v1/conversations/{conversationId}/messages`
Retrieve message history with execution summaries and tool calls.
- Returns: `Message[]`

### `DELETE /api/v1/conversations/{conversationId}`
Delete a conversation.
- Returns: `{"success": true}`

---

## 4. Human Approval Center API

### `GET /api/v1/approvals`
List pending and historical human approvals.
- Query params: `status` ('pending' | 'approved' | 'rejected' | 'all')
- Returns: `ApprovalRequest[]`

### `POST /api/v1/approvals/{requestId}/decision`
Submit human decision.
- Body:
```json
{
  "decision": "approve",
  "notes": "Approved with adjusted timing",
  "modifiedPayload": {
    "title": "Board Prep Sync (Revised)",
    "start": "2026-10-01T14:30:00"
  }
}
```
- Returns: `ApprovalRequest` with updated status.

---

## 5. Connected Apps & MCP Integrations API

### `GET /api/v1/integrations`
List all integration cards, status, and declared MCP tools.
- Returns: `ConnectedApp[]`

### `POST /api/v1/integrations/{appId}/connect`
Initiate OAuth2 / token connection flow.
- Returns: `{"authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...", "status": "pending_auth"}`

### `POST /api/v1/integrations/{appId}/disconnect`
Disconnect an integration and revoke MCP server session.
- Returns: `{"success": true}`

### `POST /api/v1/integrations/{appId}/sync`
Trigger manual healthcheck & capability discovery.
- Returns: `ConnectedApp`

---

## 6. Long-Term Memory API

### `GET /api/v1/memories`
Search and filter memory records.
- Query params: `query` (string), `category` ('all' | 'semantic' | 'preference' | 'episodic' | 'procedural'), `limit`, `offset`
- Returns: `Memory[]`

### `POST /api/v1/memories`
Manually create a verified memory entry.
- Body:
```json
{
  "category": "preference",
  "title": "Executive calendar buffer",
  "content": "Always reserve 15 minutes of transition buffer between external meetings.",
  "tags": ["calendar", "executive-rules"],
  "confidence": 1.0
}
```
- Returns: `Memory`

### `DELETE /api/v1/memories/{memoryId}`
Permanently delete or soft-delete a memory vector.
- Returns: `{"success": true}`

---

## 7. Autonomous Scheduled Tasks API

### `GET /api/v1/tasks`
List scheduled, running, and historical background jobs.
- Query params: `status` ('scheduled' | 'running' | 'completed' | 'failed' | 'all')
- Returns: `ScheduledTask[]`

### `POST /api/v1/tasks`
Schedule a new autonomous task.
- Body:
```json
{
  "title": "Daily 8 AM Executive Morning Briefing",
  "description": "Synthesize unread emails, check calendar for conflicts, and post a concise morning briefing.",
  "assignedAgentId": "executive_secretary",
  "cronExpression": "0 8 * * 1-5",
  "priority": "high",
  "requiresHumanApproval": true,
  "targetMcpServers": ["mcp-gmail", "mcp-calendar", "mcp-telegram"]
}
```
- Returns: `ScheduledTask`

### `PATCH /api/v1/tasks/{taskId}/toggle`
Toggle task enabled/disabled state.
- Body: `{"enabled": boolean}`
- Returns: `ScheduledTask`

### `DELETE /api/v1/tasks/{taskId}`
Delete a scheduled task.
- Returns: `{"success": true}`

---

## 8. Observability & Agent Runs API

### `GET /api/v1/observability/runs`
List execution traces and performance metrics.
- Query params: `limit`, `status`, `agentId`
- Returns: `ObservabilityRun[]`

### `GET /api/v1/observability/stats`
Get 24h operational health summary.
- Returns: `SystemHealthSummary`
