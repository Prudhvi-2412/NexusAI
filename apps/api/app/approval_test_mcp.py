"""Local-only MCP fixture for exercising approval-gated writes safely.

The tool records a short marker under /tmp inside the API container. It does
not contact an external service or alter user data. Keep this server configured
only while validating the approval workflow.
"""

from pathlib import Path

from mcp.server.mcpserver import MCPServer


mcp = MCPServer("NexusAI approval test")


@mcp.tool()
def record_approval_test(message: str) -> dict[str, str]:
    """Record a harmless approval test marker in the API container's /tmp."""
    marker = message.strip()
    if not marker or len(marker) > 200:
        raise ValueError("message must contain 1 to 200 characters")
    path = Path("/tmp/nexusai-approval-test.log")
    with path.open("a", encoding="utf-8") as marker_file:
        marker_file.write(marker.replace("\r", " ").replace("\n", " ") + "\n")
    return {"recorded": marker, "path": str(path)}


if __name__ == "__main__":
    mcp.run()
