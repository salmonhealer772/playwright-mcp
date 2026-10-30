# playwright-mcp

A Playwright browser-control MCP server, deployed on the lima k3s cluster as a
Kubernetes Deployment with a logging sidecar, exposed over a ClusterIP Service,
and packaged with the agent-side skill and toolbelt needed to drive it.

```
                        Kubernetes (namespace: default)
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │   ┌───────────────────────────── Pod ─────────────────────────────┐  │
  │   │  hostNetwork: true, dnsPolicy: Default                        │  │
  │   │                                                                │  │
  │   │  ┌──────────────────────┐        ┌─────────────────────────┐   │  │
  │   │  │  mcp-logger          │  127.0 │  playwright-mcp          │   │  │
  │   │  │  (sidecar, 8931)     │ ─────► │  (main, 8932)           │   │  │
  │   │  │  reverse proxy +     │  :8932 │  headless Chromium       │   │  │
  │   │  │  structured logging  │        │  MCP server              │   │  │
  │   │  └──────────┬───────────┘        └─────────────────────────┘   │  │
  │   │             │ writes JSON lines                                  │  │
  │   │             ▼                                                    │  │
  │   │   /var/log/playwright-mcp/access.log  (emptyDir, shared)        │  │
  │   └────────────────────────────────────────────────────────────────┘  │
  │                          ▲                                            │
  └──────────────────────────┼────────────────────────────────────────────┘
                             │
                  Service sudo-playwright-mcp (ClusterIP)
                     port 8931 -> targetPort 8931
                             │
                    http://sudo-playwright-mcp:8931/mcp
```

## What it is

- `playwright-mcp` container runs the official Playwright MCP server
  (`mcr.microsoft.com/playwright/mcp:latest`) headless, bound to
  `127.0.0.1:8932`.
- `mcp-logger` sidecar listens on `0.0.0.0:8931`, streams requests through to
  the MCP server, and logs every request/response as structured JSON to stdout
  and `/var/log/playwright-mcp/access.log`.
- A ClusterIP Service exposes the logger at `sudo-playwright-mcp:8931`.
- Agents attach via streamable HTTP at `http://sudo-playwright-mcp:8931/mcp`.

## Deploy

```sh
# 1. Build the logger sidecar image and import it into k3s
cd logger
docker build -t mcp-logger:latest .
docker save mcp-logger:latest -o /tmp/mcp-logger.tar
k3s ctr images import /tmp/mcp-logger.tar

# 2. Apply the manifests
cd ..
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# 3. Wait for it to be ready (2/2)
kubectl rollout status deploy/sudo-playwright-mcp
kubectl get pod -l app=sudo-playwright-mcp
```

## Connect (any MCP client)

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

With `hostNetwork: true` the server is also reachable from the host at
`http://192.168.5.15:8931/mcp`.

## Verify

```sh
# initialize handshake
curl -i -X POST http://sudo-playwright-mcp:8931/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"1.0"}}}'

# list tools
curl -s -X POST http://sudo-playwright-mcp:8931/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# navigate and read real page content
curl -s -X POST http://sudo-playwright-mcp:8931/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"browser_navigate","arguments":{"url":"https://example.com"}}}'

# check the sidecar captured structured access log lines
kubectl exec deploy/sudo-playwright-mcp -c mcp-logger -- tail -n 2 /var/log/playwright-mcp/access.log
```

## Repository layout

```
playwright-mcp/
├── k8s/
│   ├── deployment.yaml      # Deployment (2 containers, hostNetwork)
│   └── service.yaml         # ClusterIP Service (8931 -> 8931)
├── logger/
│   ├── Dockerfile           # node:22-alpine image
│   ├── server.js            # reverse proxy + structured logger
│   └── README.md
├── skill/
│   └── SKILL.md             # agent-side skill (how/when to drive the browser)
├── toolbelt/
│   ├── mcp-config.json      # mcpServers entry
│   └── install.md           # how to register into a Letta Code agent
└── README.md
```
