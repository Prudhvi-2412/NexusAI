# NexusAI Model Context Protocol (MCP) Architecture

> **Implementation status (2026-10-07):** The API has a per-account MCP gateway for remote public HTTPS servers configured in Settings, plus optional operator-managed stdio/HTTP servers from `MCP_SERVERS_JSON` available only to the configured service owner. User bearer tokens are Fernet-encrypted at rest, account queries are owner-scoped, and private/reserved DNS targets are rejected before connecting. Tool discovery runs at request time; read-only tools can run directly and write or unannotated tools enter the durable approval flow. Editing a server URL changes its internal identity, so approvals staged for the previous URL fail closed. Google Gmail and Calendar remain account-scoped direct API adapters. See `CHANNEL_SETUP.md` for the setup and security boundaries.

NexusAI leverages the **Model Context Protocol (MCP)** developed by Anthropic as an open standard to connect the agent orchestration layer to third-party tools, data sources, and execution sandboxes.

---

## 1. Architectural Role of MCP in NexusAI

Instead of hardcoding tool-calling logic inside prompt templates, NexusAI's core acts as an **MCP Client**. All external abilities (Gmail, Calendar, Telegram, Browser automation) are encapsulated into standalone **MCP Servers**.

```
+-------------------------------------------------------------+
|                LangGraph Supervisor & Agents                |
+------------------------------+------------------------------+
                               | Tool invocation requests
                               v
+-------------------------------------------------------------+
|                      MCP Client Gateway                     |
|  - Manages subprocess connections (stdio) / SSE connections |
|  - Aggregates tool manifests via JSON-RPC 2.0               |
|  - Enforces permissions and Human-in-the-Loop gates         |
+----+-------------------+-------------------+----------------+
     | stdio / IPC       | stdio / IPC       | stdio / IPC
     v                   v                   v
+----+-----------+ +-----+----------+ +------+----------+
|  mcp-server-   | |  mcp-server-   | |  mcp-server-    |
|     gmail      | |    calendar    | |   playwright    |
| (Official SDK) | | (Official SDK) | |  (Headless OS)  |
+----------------+ +----------------+ +-----------------+
```

---

## 2. Server Specifications

### 2.1 `mcp-server-gmail`
- **Transport**: `stdio` process running within the backend container or dedicated sidecar.
- **Library**: `mcp` (official Python SDK) + Google API Client.
- **Authentication**: Stored OAuth2 refresh tokens loaded securely per user session.
- **Exposed Tools**:
  - `gmail_search_messages(query: str, max_results: int = 10)`
  - `gmail_get_thread(thread_id: str)`
  - `gmail_create_draft(to: list[str], subject: str, body_html: str)`
  - `gmail_send_message(to: list[str], subject: str, body_html: str)` *(Requires Human Approval)*
  - `gmail_modify_labels(message_id: str, add_labels: list[str], remove_labels: list[str])`

### 2.2 `mcp-server-calendar`
- **Transport**: `stdio` process.
- **Library**: Google Calendar API v3.
- **Exposed Tools**:
  - `calendar_list_events(time_min: str, time_max: str, calendar_id: str = "primary")`
  - `calendar_check_availability(time_slots: list[dict], attendees: list[str])`
  - `calendar_create_event(title: str, start: str, end: str, attendees: list[str], description: str)` *(Requires Human Approval)*
  - `calendar_delete_event(event_id: str)` *(Requires Human Approval)*

### 2.3 `mcp-server-telegram`
- **Transport**: `stdio` process / Async client.
- **Library**: `python-telegram-bot` / `telethon`.
- **Exposed Tools**:
  - `telegram_send_direct_message(recipient_id: str, text: str)` *(Requires Human Approval)*
  - `telegram_get_recent_chats(limit: int = 10)`
  - `telegram_post_channel_update(channel_id: str, message: str)` *(Requires Human Approval)*

### 2.4 `mcp-server-playwright`
- **Transport**: Node.js or Python `playwright` subprocess.
- **Security Sandboxing**: Headless Chromium isolated in non-privileged container with network egress filtering.
- **Exposed Tools**:
  - `browser_navigate(url: str)`
  - `browser_take_screenshot()`
  - `browser_click_element(selector: str)`
  - `browser_fill_form(selector: str, value: str)`
  - `browser_extract_text(selector: str)`

---

## 3. Human-in-the-Loop Interceptor Pattern

Before the MCP Client forwards a tool execution request to an MCP server, it consults the `GuardrailPolicyEngine`:

```python
class McpToolInterceptor:
    APPROVAL_REQUIRED_TOOLS = {
        "gmail_send_message",
        "calendar_create_event",
        "calendar_delete_event",
        "telegram_send_direct_message",
        "browser_fill_form",
    }

    async def execute_tool(self, tool_name: str, arguments: dict, run_id: str) -> ToolResult:
        if tool_name in self.APPROVAL_REQUIRED_TOOLS:
            approval_request = await self.create_approval_request(
                run_id=run_id,
                tool_name=tool_name,
                arguments=arguments
            )
            # Emit SSE event and suspend graph execution
            raise ToolRequiresApprovalException(approval_request)
        
        # Safe to execute immediately
        return await self.mcp_client.call_tool(tool_name, arguments)
```

---

## 4. Current Implementation and Next Work

- Per-account HTTPS MCP connector management is available under Settings → MCP connectors. The API stores endpoint metadata and encrypted bearer credentials under the signed-in owner.
- Tool discovery is live. A connector can be tested from Settings; discovered read-only tools can run directly, while write or unannotated tools require approval.
- Operator `MCP_SERVERS_JSON` configuration remains available to the configured service owner, including stdio fixture servers.
- User-configured stdio processes, connector OAuth flows, richer auth schemes, and distributed connection pooling are not implemented.
- Remote DNS is checked before connection to reject loopback, private, and reserved addresses. Deployments should still apply network egress controls at the container/network layer.
