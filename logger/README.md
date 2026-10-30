# mcp-logger

A tiny reverse-proxy sidecar that fronts the Playwright MCP server and logs
every request and response as structured JSON lines.

- Listens on `0.0.0.0:8931` (the port the Kubernetes Service exposes).
- Forwards to the MCP server on `127.0.0.1:8932`.
- Streams responses (SSE / streamable-HTTP safe): response chunks are written
  to the client as they arrive, never buffered.
- Writes one JSON line per exchange to BOTH `stdout` and
  `/var/log/playwright-mcp/access.log` (an `emptyDir` shared with the MCP pod).
- Serves `GET /healthz` -> 200 for liveness/readiness probes.

## Log record shape

```json
{
  "timestamp": "2026-10-30T12:00:00.000Z",
  "client_ip": "10.42.0.1",
  "method": "POST",
  "path": "/mcp",
  "request_headers": { "content-type": "application/json", "...": "..." },
  "request_body": "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",...}",
  "response_status": 200,
  "response_headers": { "content-type": "text/event-stream", "...": "..." },
  "response_body": "event: message\ndata: {...}\n\n",
  "duration_ms": 1234
}
```

## Configuration (environment variables)

| Variable               | Default                | Meaning                        |
| ---------------------- | ---------------------- | ------------------------------ |
| `LOGGER_LISTEN_HOST`   | `0.0.0.0`              | Bind address                   |
| `LOGGER_LISTEN_PORT`   | `8931`                 | Listen port                    |
| `LOGGER_UPSTREAM_HOST` | `127.0.0.1`            | Upstream MCP host              |
| `LOGGER_UPSTREAM_PORT` | `8932`                 | Upstream MCP port              |
| `LOGGER_LOG_DIR`       | `/var/log/playwright-mcp` | Log directory (access.log) |

> Note: the proxy rewrites the `Host` header to `localhost:<upstream-port>`
> before forwarding. The Playwright MCP server's `--allowed-hosts` default only
> accepts `localhost:8932` and returns `403` for any other Host (the client's
> original Host is still preserved in the logged `request_headers`).

## Build

```sh
docker build -t mcp-logger:latest .
```
