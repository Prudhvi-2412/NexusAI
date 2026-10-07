"""Environment-configured MCP client gateway.

Only explicitly configured servers can be reached. Tools must declare the
MCP readOnlyHint for direct invocation; all other tools remain approval-gated.
"""

from __future__ import annotations

import json
import logging
import ipaddress
import re
import socket
import asyncio
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from urllib.parse import urlsplit

import httpx
from mcp import Client
from mcp.client.stdio import StdioServerParameters
from mcp.client.streamable_http import streamable_http_client
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

log = logging.getLogger(__name__)


class MCPServerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=48)
    url: str | None = None
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    headers: dict[str, str] = Field(default_factory=dict)
    public_only: bool = False

    @model_validator(mode="after")
    def valid_transport(self):
        if bool(self.url) == bool(self.command):
            raise ValueError("Configure exactly one of url or command")
        if self.url:
            parsed = urlsplit(self.url)
            loopback_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            if parsed.scheme != "https" and not loopback_http:
                raise ValueError("MCP URL must use HTTPS (HTTP is allowed only on loopback)")
            if not parsed.hostname:
                raise ValueError("MCP URL must include a valid hostname")
            if self.public_only:
                host = parsed.hostname.casefold().rstrip(".")
                if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment or host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".test")):
                    raise ValueError("Account MCP servers require public HTTPS URLs without embedded credentials, query strings, or fragments")
                try:
                    ipaddress.ip_address(host)
                except ValueError:
                    pass
                else:
                    raise ValueError("Account MCP servers require a public DNS hostname")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", self.name):
            raise ValueError("MCP server name may contain only letters, numbers, hyphens, and underscores")
        return self


class MCPGateway:
    def __init__(self, servers: list[MCPServerConfig]):
        self.servers = {server.name: server for server in servers}

    @classmethod
    def from_json(cls, raw: str) -> "MCPGateway":
        try:
            data = json.loads(raw or "[]")
            if not isinstance(data, list) or len(data) > 20:
                raise ValueError("MCP_SERVERS_JSON must be an array with at most 20 servers")
            servers = [MCPServerConfig.model_validate(item) for item in data]
            if len({server.name for server in servers}) != len(servers):
                raise ValueError("MCP server names must be unique")
            return cls(servers)
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            raise ValueError(f"Invalid MCP_SERVERS_JSON: {exc}") from exc

    @asynccontextmanager
    async def connect(self, name: str) -> AsyncIterator[Client]:
        config = self.servers.get(name)
        if config is None:
            raise KeyError("MCP server is not configured")
        if config.url:
            if config.public_only:
                await asyncio.to_thread(self._assert_public_https_host, config.url)
            async with httpx.AsyncClient(headers=config.headers, timeout=30) as http_client:
                transport = streamable_http_client(config.url, http_client=http_client)
                async with Client(transport) as client:
                    yield client
        else:
            parameters = StdioServerParameters(command=config.command or "", args=config.args, env=config.env)
            async with Client(parameters) as client:
                yield client

    @staticmethod
    def _assert_public_https_host(url: str) -> None:
        parsed = urlsplit(url)
        hostname = (parsed.hostname or "").rstrip(".").casefold()
        try:
            port = parsed.port or 443
        except ValueError as exc:
            raise ValueError("MCP server URL has an invalid port") from exc
        if parsed.scheme != "https" or not hostname or hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal", ".test")):
            raise ValueError("MCP remote servers must use a public HTTPS hostname")
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            pass
        else:
            raise ValueError("MCP remote servers must use a public HTTPS hostname")
        try:
            addresses = {item[4][0] for item in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)}
        except OSError as exc:
            raise ValueError("Could not resolve the MCP server hostname") from exc
        if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise ValueError("MCP remote servers cannot resolve to private or reserved network addresses")

    @staticmethod
    def _tool_json(server: str, tool: Any) -> dict:
        annotations = getattr(tool, "annotations", None)
        read_only = bool(getattr(annotations, "read_only_hint", False))
        return {
            "name": f"{server}__{tool.name}",
            "server": server,
            "tool": tool.name,
            "title": getattr(tool, "title", None),
            "description": getattr(tool, "description", None) or "",
            "inputSchema": getattr(tool, "input_schema", None) or {"type": "object", "properties": {}},
            "readOnly": read_only,
            "requiresApproval": not read_only,
        }

    async def list_server_tools(self, name: str) -> list[dict]:
        async with self.connect(name) as client:
            result = await client.list_tools()
            return [self._tool_json(name, item) for item in result.tools]

    async def list_tools(self) -> list[dict]:
        found = []
        for name in self.servers:
            try:
                found.extend(await self.list_server_tools(name))
            except Exception as exc:
                log.warning("MCP server %s unavailable: %s", name, type(exc).__name__)
        return found

    async def call_read_tool(self, server: str, tool_name: str, arguments: dict[str, Any]) -> dict:
        async with self.connect(server) as client:
            tools = await client.list_tools()
            tool = next((item for item in tools.tools if item.name == tool_name), None)
            if tool is None:
                raise KeyError("MCP tool was not found on this server")
            if not bool(getattr(getattr(tool, "annotations", None), "read_only_hint", False)):
                raise PermissionError("This MCP tool requires user approval before execution")
            result = await client.call_tool(tool_name, arguments)
            return {
                "isError": bool(result.is_error),
                "content": [
                    {"type": getattr(block, "type", "text"), "text": getattr(block, "text", "")}
                    for block in result.content
                    if getattr(block, "type", None) == "text"
                ],
                "structuredContent": getattr(result, "structured_content", None),
            }

    async def call_approved_tool(self, server: str, tool_name: str, arguments: dict[str, Any]) -> dict:
        """Execute a write-capable tool after the caller has verified an approval."""
        async with self.connect(server) as client:
            tools = await client.list_tools()
            tool = next((item for item in tools.tools if item.name == tool_name), None)
            if tool is None:
                raise KeyError("Approved MCP tool is no longer available")
            if bool(getattr(getattr(tool, "annotations", None), "read_only_hint", False)):
                raise PermissionError("Tool permissions changed after approval; request approval again")
            result = await client.call_tool(tool_name, arguments)
            return {
                "isError": bool(result.is_error),
                "content": [
                    {"type": getattr(block, "type", "text"), "text": getattr(block, "text", "")}
                    for block in result.content
                    if getattr(block, "type", None) == "text"
                ],
                "structuredContent": getattr(result, "structured_content", None),
            }
