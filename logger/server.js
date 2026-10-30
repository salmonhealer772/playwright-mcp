#!/usr/bin/env node
/*
 * mcp-logger — reverse proxy + structured access logger for the Playwright MCP.
 *
 * Listens on 0.0.0.0:8931, forwards every request to 127.0.0.1:8932 (the
 * Playwright MCP server), and logs one JSON line per request/response to BOTH
 * stdout and /var/log/playwright-mcp/access.log.
 *
 * Responses are STREAMED: chunks are written to the client as they arrive from
 * upstream (never buffered), so the MCP streamable-HTTP (SSE) transport keeps
 * working. Response bytes are accumulated in parallel purely for logging.
 */

'use strict';

const http = require('http');
const fs = require('fs');

const LISTEN_HOST = process.env.LOGGER_LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = Number(process.env.LOGGER_LISTEN_PORT || 8931);
const UPSTREAM_HOST = process.env.LOGGER_UPSTREAM_HOST || '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.LOGGER_UPSTREAM_PORT || 8932);
const LOG_DIR = process.env.LOGGER_LOG_DIR || '/var/log/playwright-mcp';
const LOG_FILE = `${LOG_DIR}/access.log`;

// Ensure the log directory exists before the first append.
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  console.error(`mcp-logger: could not create log dir ${LOG_DIR}: ${e.message}`);
}

function nowIso() {
  return new Date().toISOString();
}

function writeLog(record) {
  const line = JSON.stringify(record);
  process.stdout.write(line + '\n');
  fs.appendFile(LOG_FILE, line + '\n', (err) => {
    if (err) console.error(`mcp-logger: append error: ${err.message}`);
  });
}

function buildUpstreamHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    // Strip hop-by-hop headers that Node re-manages on the upstream request.
    if (lower === 'host' || lower === 'connection' || lower === 'keep-alive' ||
        lower === 'transfer-encoding' || lower === 'upgrade' ||
        lower === 'proxy-authorization' || lower === 'te' || lower === 'trailer') {
      continue;
    }
    out[k] = v;
  }
  // The Playwright MCP server's --allowed-hosts defaults to "localhost:<port>"
  // and rejects any other Host (127.0.0.1, a service name, an IP) with a 403.
  // The reverse proxy must present that exact Host header upstream.
  out.host = `localhost:${UPSTREAM_PORT}`;
  return out;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }

  const clientIp = req.socket.remoteAddress || '';
  const startedAt = Date.now();
  const requestChunks = [];

  req.on('data', (chunk) => requestChunks.push(chunk));
  req.on('end', () => {
    const requestBody = Buffer.concat(requestChunks).toString('utf8');
    const requestHeaders = req.headers;
    const upstreamHeaders = buildUpstreamHeaders(req.headers);

    const upstream = http.request(
      {
        host: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        path: req.url,
        method: req.method,
        headers: upstreamHeaders,
      },
      (upRes) => {
        const responseChunks = [];
        res.writeHead(upRes.statusCode, upRes.headers);

        upRes.on('data', (chunk) => {
          responseChunks.push(chunk);
          // Stream to the client immediately — do not buffer the transport.
          res.write(chunk);
        });

        upRes.on('end', () => {
          const responseBody = Buffer.concat(responseChunks).toString('utf8');
          writeLog({
            timestamp: nowIso(),
            client_ip: clientIp,
            method: req.method,
            path: req.url,
            request_headers: requestHeaders,
            request_body: requestBody,
            response_status: upRes.statusCode,
            response_headers: upRes.headers,
            response_body: responseBody,
            duration_ms: Date.now() - startedAt,
          });
          res.end();
        });
      }
    );

    upstream.on('error', (err) => {
      writeLog({
        timestamp: nowIso(),
        client_ip: clientIp,
        method: req.method,
        path: req.url,
        request_headers: requestHeaders,
        request_body: requestBody,
        error: err && err.message ? err.message : String(err),
        duration_ms: Date.now() - startedAt,
      });
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'upstream error: ' + (err && err.message ? err.message : String(err)),
          },
        })
      );
    });

    upstream.end(Buffer.from(requestBody));
  });
});

server.on('error', (err) => {
  console.error(`mcp-logger: server error: ${err.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `mcp-logger listening on ${LISTEN_HOST}:${LISTEN_PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT} (log: ${LOG_FILE})`
  );
});
