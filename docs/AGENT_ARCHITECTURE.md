# NexusAI Agent Orchestration Architecture

This document describes the multi-agent orchestration architecture for NexusAI, specifying how **LangGraph** coordinates the supervisor and specialized sub-agents.

---

## 1. Supervisor-Worker Pattern

NexusAI implements a hierarchical **Supervisor-Worker** multi-agent topology using LangGraph:

```
                          +------------------------+
                          |   User Prompt / Goal   |
                          +-----------+------------+
                                      |
                                      v
                          +------------------------+
                          |   LangGraph Supervisor |
                          |  (Plan, Route, Judge)  |
                          +-----------+------------+
                                      |
         +------------------+---------+---------+------------------+
         |                  |                   |                  |
         v                  v                   v                  v
  +--------------+   +---------------+   +--------------+   +---------------+
  | Comms Agent  |   |Calendar Agent |   |Browser Agent |   |Memory Curator |
  | (Draft/Read) |   | (Schedule/Av) |   | (Web Nav)    |   | (Vector Store)|
  +-------+------+   +-------+-------+   +-------+------+   +-------+-------+
          |                  |                   |                  |
          +------------------+---------+---------+------------------+
                                       |
                                       v
                          +------------------------+
                          |  MCP Execution Engine  |
                          +-----------+------------+
                                      |
                                      v
                          +------------------------+
                          |  Final Response Synth  |
                          +------------------------+
```

---

## 2. Graph State Schema (`NexusState`)

The state passed through the LangGraph workflow:

```python
from typing import Annotated, Sequence, TypedDict
from langchain_core.messages import BaseMessage
import operator

class NexusState(TypedDict):
    # Core message history
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # Metadata
    conversation_id: str
    run_id: str
    active_agent: str
    
    # Execution Progress (Safe for UI display)
    execution_steps: list[dict] # {id, name, type, summary, status, duration_ms}
    
    # Current pending tool approval
    pending_approval: dict | None
    
    # Memory Context injected at start
    relevant_memories: list[dict]
    user_preferences: list[dict]
    
    # Next node pointer
    next_node: str
```

---

## 3. Safe Reasoning Summaries vs. Chain-of-Thought

> **CRITICAL SECURITY & PRIVACY REQUIREMENT**:
> NexusAI strictly prohibits streaming raw, unstructured Chain-of-Thought (CoT) prompts or hidden scratchpad reasoning directly to the user interface.

Instead:
1. Agent internal reasoning remains encapsulated inside backend LangGraph node transitions.
2. When an agent transitions or completes a reasoning phase, it emits structured **Progress Summaries**:
   - `Understanding request`
   - `Memory retrieval: Found 2 preferences regarding morning meetings`
   - `Gmail search: Querying messages from 'board@company.com'`
   - `Calendar lookup: Checking free slots between 2:00 PM and 4:30 PM`
   - `Final response synthesis`
3. The frontend renders these as interactive, non-intrusive step cards with status indicators (pending, active, completed, failed) and durations.

---

## 4. Graph Nodes & Transitions

1. **`supervisor_node`**:
   - Analyzes user intent + retrieved memory context.
   - Outputs either a direct answer OR delegates to a worker agent (`calendar_agent`, `comms_agent`, `browser_agent`).

2. **`worker_nodes`**:
   - Formulate concrete tool execution requests using bound MCP tool schemas.
   - If tool requires human approval: transitions to `wait_for_approval_node`.
   - If tool is safe: calls `mcp_executor_node`.

3. **`wait_for_approval_node`**:
   - Checkpoints state into PostgreSQL (`PostgresSaver`).
   - Emits `approval:required` SSE event to user.
   - Graph pauses until HTTP endpoint receives human decision.

4. **`mcp_executor_node`**:
   - Executes tools via MCP Client.
   - Emits `tool:start` and `tool:end` events.
   - Feeds tool results back to the calling worker agent.

5. **`synthesizer_node`**:
   - Packages final answer in concise executive tone.
   - Emits `stream:chunk` events to frontend.
   - Triggers `memory_curator_node` in the background to distill key facts into pgvector.

---

## 5. Checkpointing & Resume Strategy

NexusAI uses `langgraph.checkpoint.postgres` (`PostgresSaver`):
- Graph state is saved after every node execution.
- If a long-running research or browser automation task takes minutes, it does not hold an HTTP socket open.
- When human approval is granted via `POST /api/v1/approvals/{id}/decision`, the graph resumes from the exact checkpoint:
  ```python
  app = graph.compile(checkpointer=checkpointer)
  config = {"configurable": {"thread_id": run_id}}
  # Resume execution with human decision payload
  await app.ainvoke(Command(resume={"approved": True, "notes": "Proceed"}), config=config)
  ```
