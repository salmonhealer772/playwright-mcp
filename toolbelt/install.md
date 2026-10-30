# Registering the Playwright MCP server into a Letta Code agent

This MCP server exposes the Playwright browser-control tools to any agent that
lists it as an MCP server. Register it and the `browser_*` tools become
available to the agent's harness.

## Endpoint

- Streamable HTTP endpoint: `http://sudo-playwright-mcp:8931/mcp`
- (On the host itself it is also reachable at `http://192.168.5.15:8931/mcp`
  because the pod runs with `hostNetwork: true`.)

## 1. The MCP config entry

Add this `mcpServers` entry to the agent's MCP configuration (the same shape as
`toolbelt/mcp-config.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://sudo-playwright-mcp:8931/mcp",
      "transport": "streamable-http"
    }
  }
}
```

## 2. Register it into a Letta Code agent

Letta Code loads MCP servers through `letta mcp`. On the Letta pod:

```sh
# List currently attached MCP servers
letta mcp list

# Attach the Playwright MCP server by URL
letta mcp add --name playwright --transport streamable-http http://sudo-playwright-mcp:8931/mcp
```

Confirm the tools appear:

```sh
# The browser_* tools should now be listed among the agent's tools
letta tools list | grep browser_
```

If the agent uses a static MCP config file, merge `toolbelt/mcp-config.json`
into that file instead and restart the agent.

## 3. Verify end to end

Ask the agent to navigate and read a page, or test the server directly:

```sh
curl -i -X POST http://sudo-playwright-mcp:8931/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"1.0"}}}'
```

A successful `initialize` returns a JSON-RPC result with server info. Then call
`tools/call` with `name: "browser_navigate"` and
`arguments: {"url": "https://example.com"}` to see real page content.

## 4. Load the agent-side skill

Drop `skill/SKILL.md` into the agent's skills so it knows WHEN and HOW to drive
the browser (snapshot first, act, re-read).
