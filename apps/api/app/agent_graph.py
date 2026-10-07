"""Account-scoped LangGraph routing for NexusAI's read-only specialists."""

from __future__ import annotations

import re
from operator import add
from typing import Annotated, Awaitable, Callable, TypedDict
from uuid import uuid4

from fastapi import HTTPException
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt


class AgentState(TypedDict, total=False):
    owner_id: str
    run_id: str
    message: str
    pending: list[str]
    planned: list[str]
    last_agent: str
    findings: Annotated[list[dict], add]


AGENTS = {
    "memory": ("Memory Agent", "memory_search", "Saved memory"),
    "communications": ("Communications Agent", "gmail_list_unread", "Google API adapter"),
    "calendar": ("Calendar Agent", "calendar_list_upcoming", "Google API adapter"),
    "learning": ("Learning Agent", "classroom_list_my_coursework", "Google API adapter"),
    "people": ("People Agent", "contacts_search", "Google API adapter"),
    "developer": ("Developer Agent", "github_read", "GitHub API adapter"),
}


def planned_agents(message: str) -> list[str]:
    """Select only relevant read specialists; ordinary chat needs no external read."""
    query = message.casefold()
    read = any(word in query for word in ("check", "read", "summar", "brief", "show", "list", "what", "unread", "upcoming", "due", "find", "search", "today", "tomorrow", "latest", "status"))
    plan = ["memory"]
    if read and any(word in query for word in ("email", "gmail", "inbox", "unread")):
        plan.append("communications")
    if read and (any(word in query for word in ("calendar", "schedule", "events", "availability", "agenda"))):
        plan.append("calendar")
    if read and any(word in query for word in ("classroom", "coursework", "assignment", "assignments", "courses")):
        plan.append("learning")
    if read and any(word in query for word in ("contact", "contacts", "phone number")):
        plan.append("people")
    if read and any(word in query for word in ("github", "repository", "repositories", "repo", "issue", "pull request", "workflow", "actions run", "ci run")):
        plan.append("developer")
    return plan


def github_tool(message: str) -> str:
    query = message.casefold()
    if not re.search(r"\b[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}\b", message):
        return "github_list_repositories"
    if any(word in query for word in ("pull request", "pull requests", "prs")):
        return "github_list_pull_requests"
    if any(word in query for word in ("workflow", "actions run", "ci run", "build run")):
        return "github_list_workflow_runs"
    if any(word in query for word in ("issue", "issues", "bug")):
        return "github_list_issues"
    return "github_list_repositories"


Reader = Callable[[str, str], Awaitable[dict]]
Planner = Callable[[str], Awaitable[list[str]]]
ActionExecutor = Callable[[str, str, str, dict, str], Awaitable[dict]]


def build_agent_graph(readers: dict[str, Reader], planner: Planner | None = None):
    graph = StateGraph(AgentState)

    async def supervisor(state: AgentState) -> dict:
        writer = get_stream_writer()
        writer({"type": "step:start", "data": {"stepId": "route", "name": "Plan specialist work", "agentName": "Nexus Supervisor", "summary": "Selecting account-scoped specialists"}})
        plan = planned_agents(state["message"])
        if planner and plan == ["memory"] and any(word in state["message"].casefold() for word in ("what", "brief", "prepare", "today", "tomorrow", "help me plan")):
            plan += [item for item in await planner(state["message"]) if item in AGENTS and item not in plan]
        writer({"type": "step:complete", "data": {"stepId": "route", "summary": "Handoff plan: " + ", ".join(AGENTS[item][0] for item in plan)}})
        return {"pending": plan, "planned": plan, "last_agent": "Nexus Supervisor"}

    def next_node(state: AgentState) -> str:
        return state["pending"][0] if state.get("pending") else "synthesis_handoff"

    graph.add_node("supervisor", supervisor)
    graph.add_edge(START, "supervisor")
    graph.add_conditional_edges("supervisor", next_node)

    for key, (agent_name, default_tool, server) in AGENTS.items():
        def make_worker(agent_key: str, name: str, tool: str, tool_server: str):
            async def worker(state: AgentState) -> dict:
                writer = get_stream_writer()
                selected_tool = github_tool(state["message"]) if agent_key == "developer" else tool
                step_id = f"agent_{agent_key}"
                call_id = f"tc_{uuid4().hex}"
                writer({"type": "agent:handoff", "data": {"fromAgent": state.get("last_agent", "Nexus Supervisor"), "toAgent": name, "reason": "Relevant read-only request"}})
                writer({"type": "step:start", "data": {"stepId": step_id, "name": name, "agentName": name, "summary": "Reading connected data"}})
                writer({"type": "tool:start", "data": {"toolCall": {"id": call_id, "name": selected_tool, "server": tool_server, "agentName": name, "input": {}, "status": "executing"}}})
                try:
                    result = await readers[agent_key](state["owner_id"], state["message"])
                    status = "success"
                    event_result = {"count": len(next(iter(result.values()))) if result and isinstance(next(iter(result.values())), list) else 1}
                except HTTPException as exc:
                    status = "failed"
                    message = str(exc.detail) if exc.status_code != 409 else f"{name} account is not connected."
                    result = {"error": message}
                    event_result = result
                except Exception:
                    status = "failed"
                    result = {"error": f"{name} could not complete this read."}
                    event_result = result
                writer({"type": "tool:end", "data": {"toolCallId": call_id, "status": status, "result": event_result}})
                writer({"type": "step:complete", "data": {"stepId": step_id, "summary": "Read complete" if status == "success" else "Read unavailable"}})
                return {"pending": state["pending"][1:], "last_agent": name, "findings": [{"agent": name, "tool": selected_tool, "result": result}]}
            return worker

        graph.add_node(key, make_worker(key, agent_name, default_tool, server))
        graph.add_conditional_edges(key, next_node)

    async def synthesis_handoff(state: AgentState) -> dict:
        get_stream_writer()({"type": "agent:handoff", "data": {"fromAgent": state.get("last_agent", "Nexus Supervisor"), "toAgent": "Nexus Supervisor", "reason": "Synthesize specialist findings"}})
        return {"last_agent": "Nexus Supervisor"}

    graph.add_node("synthesis_handoff", synthesis_handoff)
    graph.add_edge("synthesis_handoff", END)
    return graph


class ActionState(TypedDict, total=False):
    owner_id: str
    approval_id: str
    server: str
    tool: str
    arguments: dict
    approved: bool
    result: dict


def build_action_graph(executor: ActionExecutor):
    """Pause at a durable interrupt and execute an MCP write only after approval."""
    graph = StateGraph(ActionState)

    def approval_gate(state: ActionState) -> dict:
        decision = interrupt({
            "approvalId": state["approval_id"],
            "service": state["server"],
            "tool": state["tool"],
            "arguments": state["arguments"],
        })
        return {"approved": bool(isinstance(decision, dict) and decision.get("approved"))}

    async def execute(state: ActionState) -> dict:
        result = await executor(
            state["owner_id"], state["server"], state["tool"],
            state["arguments"], state["approval_id"],
        )
        return {"result": result}

    def after_approval(state: ActionState) -> str:
        return "execute" if state.get("approved") else END

    graph.add_node("approval_gate", approval_gate)
    graph.add_node("execute", execute)
    graph.add_edge(START, "approval_gate")
    graph.add_conditional_edges("approval_gate", after_approval)
    graph.add_edge("execute", END)
    return graph
