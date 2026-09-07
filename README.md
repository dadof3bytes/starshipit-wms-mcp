# starshipit-wms-mcp-server

Streamable HTTP MCP server for the [Starshipit WMS API](https://support.starshipit.com/developers/api-reference/wms). Connect any MCP client (Cursor, Claude Desktop, [Viktor](https://viktor.com), MCP Inspector, etc.) to run warehouse workflows through AI agents.

> **Disclaimer:** Unofficial community MCP server. Not affiliated with or endorsed by Starshipit.

This server covers WMS only (`https://wms.starshipit.com`). Orders, labels, rates, manifests, and tracking stay on `https://api.starshipit.com` and are out of scope.

## Prerequisites

Before deploying or connecting:

1. A **Starshipit account with the WMS add-on** enabled.
2. A **Starshipit API key** from **Settings → API** for that account.
3. **HTTPS** in production — remote MCP clients expect a public `https://your-host/mcp` URL.
4. Awareness that some tools need specific WMS permissions on the key (for example `stocktake.approve`, `analytics.view`, `analytics.export` for CSV reports).

## Quick start (Docker)

```bash
docker build -t starshipit-wms-mcp .
docker run -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -e TRANSPORT=http \
  starshipit-wms-mcp
```

Health check: `GET http://localhost:3000/health`

For production, put the container behind a reverse proxy with TLS and set `ALLOWED_HOSTS` to your public hostname if you want to restrict the Host header (see [Troubleshooting](#troubleshooting)).

## Connect an MCP client

All clients use the same pattern:

| Setting | Value |
| --- | --- |
| **URL** | `https://your-host.example/mcp` |
| **Auth** | Starshipit API key as `Authorization: Bearer <key>` |

The server also accepts `x-api-key` and `starshipit-api-key` headers.

### Cursor

Add a streamable HTTP MCP server in Cursor settings pointing at your `/mcp` URL. Supply the Starshipit API key in the auth field your client provides.

### MCP Inspector (local testing)

```bash
npm install && cp .env.example .env
# set STARSHIPIT_API_KEY, then:
npm run build && TRANSPORT=http HOST=127.0.0.1 PORT=3000 npm start

npx @modelcontextprotocol/inspector
```

Connect to `http://127.0.0.1:3000/mcp` with Streamable HTTP and send the key as `Authorization: Bearer <key>`.

### Viktor

1. Deploy on HTTPS. The public URL must be the MCP endpoint, e.g. `https://your-host.example/mcp`.
2. In Viktor open **Integrations → Add custom MCP** and paste that URL.
3. Viktor probes the server. Unauthenticated requests return `401` with `WWW-Authenticate: Bearer` and **no** OAuth metadata, so Viktor asks for a static key.
4. Paste the Starshipit API key from **Settings → API**.
5. First test: list tools, then pull inventory for a known SKU or READY pick jobs.

### Claude Desktop / other clients

Use streamable HTTP transport if supported. Point at `/mcp` and pass the Starshipit API key as a bearer token. For stdio-only clients, run locally with `TRANSPORT=stdio` (see [Local development](#local-development)).

## Authentication

Every `/mcp` request (except `GET /health`) needs a key, checked in this order:

1. `Authorization: Bearer <key>`
2. `x-api-key`
3. `starshipit-api-key`
4. Local/dev only: `STARSHIPIT_API_KEY` environment variable

The value is forwarded to WMS as `starshipit-api-key`. It is never logged or returned by tools.

Do **not** send `Ocp-Apim-Subscription-Key` on WMS calls. That header is for the shipping API only.

## Read-only mode

**Writes are enabled by default** (`STARSHIPIT_WMS_READ_ONLY=false`). The server registers 85 tools including receive, pick/pack, stock movements, and stocktake mutations.

To expose only read/lookup tools (38 tools), set:

```bash
STARSHIPIT_WMS_READ_ONLY=true
```

This hides write tools at registration time — clients will not see or invoke them. Use read-only mode when:

- First connecting a new MCP client and validating reads only
- Running evaluations or analytics without mutation risk
- Giving agents inventory visibility without warehouse write access

Confirm mode via `GET /health` — the response includes `"read_only": true|false`.

In Docker:

```bash
docker run -p 3000:3000 -e STARSHIPIT_WMS_READ_ONLY=true starshipit-wms-mcp
```

## Local development

```bash
npm install
cp .env.example .env
# set STARSHIPIT_API_KEY for Inspector / stdio
npm run build
TRANSPORT=http HOST=127.0.0.1 PORT=3000 npm start
```

Stdio (local clients that do not support HTTP):

```bash
TRANSPORT=stdio STARSHIPIT_API_KEY=... node dist/index.js
```

Maintainer-only dev files: the `.agents/` directory holds local Cursor/agent skills and is gitignored. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Environment

| Variable | Purpose |
| --- | --- |
| `TRANSPORT` | `http` (default) or `stdio` |
| `PORT` | HTTP port, default `3000` |
| `HOST` | Bind address. Use `127.0.0.1` locally and `0.0.0.0` in production |
| `ALLOWED_HOSTS` | Optional comma-separated Host values allowed for `/mcp`. Leave empty to accept any host |
| `STARSHIPIT_API_KEY` | Local fallback only. Production clients supply the key per request |
| `STARSHIPIT_WMS_READ_ONLY` | `true` hides write tools (default: `false`) |

### ALLOWED_HOSTS behaviour

| `HOST` | `ALLOWED_HOSTS` | `/mcp` behaviour |
| --- | --- | --- |
| `127.0.0.1` | empty | Allows `localhost` / `127.0.0.1` only |
| `0.0.0.0` | empty | Allows **any** Host header |
| `0.0.0.0` | `your-host.example.com` | Allows only listed hostnames |

`/health` does **not** check `ALLOWED_HOSTS`, so a passing health check does not prove MCP will work.

## Behaviour notes

- Developer API access is limited to **2 requests per second**. The client serializes outbound WMS calls and retries `429` with backoff.
- Follow-up actions need **record IDs**, not SKUs, barcodes, location names, or order numbers.
- Use `quantityAvailable` for stock decisions, not only `quantityOnHand`.
- Writes have **no idempotency keys**. Re-read before retrying. `409` means warehouse state changed.
- Receiving can return HTTP 200 with `"success": false`. That is treated as a tool error.
- Pause and resume jobs only through the dedicated tools, not `starshipit_wms_update_job`.
- Responses over 25,000 characters are truncated with a paging hint.

## Tool groups

85 tools when writes are enabled (84 WMS operations plus `starshipit_wms_whoami`). `STARSHIPIT_WMS_READ_ONLY=true` registers 38 read/lookup tools only.

**Read tools (always registered):** whoami, inventory, products, locations, packages, jobs, suppliers, purchase orders, stock movements, allocations, pick/pack/putaway/kitting/replenishment reads, analytics, stocktake approval list.

**Write tools (hidden when `STARSHIPIT_WMS_READ_ONLY=true`):** product/supplier/location/package mutations, PO create/receive, stock movements, job assign/pause/resume, pick/pack/putaway/replenish/kitting/stocktake submit and approval.

Tool schemas follow the Starshipit WMS API. A vendored snapshot lives in [`docs/wms-reference.json`](docs/wms-reference.json); the [live reference](https://support.starshipit.com/developers/api-reference/wms/reference.json) is authoritative when they differ.

## Deploy

Build and run with `TRANSPORT=http`, `HOST=0.0.0.0`, and TLS terminated at your reverse proxy. A sample [Dockerfile](Dockerfile) is included.

Production checklist:

1. HTTPS enabled on your public domain
2. `GET /health` returns `"status":"ok"`
3. If using `ALLOWED_HOSTS`, value matches your public hostname exactly
4. MCP client connects to `https://your-domain/mcp` with the Starshipit API key
5. Optionally start with `STARSHIPIT_WMS_READ_ONLY=true` until reads are validated

Works with Docker, Coolify, Fly.io, Railway, or any container host that supports Node 20+.

## Troubleshooting

### MCP fails but `/health` works

**Symptom:** Client gets `403 {"error":"forbidden","message":"Invalid Host header."}` and app logs show nothing.

**Cause:** `ALLOWED_HOSTS` is set to a different hostname than your public URL (common after changing domains).

**Fix:** Update `ALLOWED_HOSTS` to your current domain, or clear it to allow any host:

```bash
ALLOWED_HOSTS=starshipit-wms-mcp.example.com
```

Restart the container after changing env vars.

### Client gets 401

No API key was sent. Confirm the client sends `Authorization: Bearer <starshipit-api-key>`.

### Tools return 403 from WMS

The Starshipit key is valid but lacks WMS permission for that action. Confirm the account has the WMS add-on and the user/key has the required permission.

### Write tools visible when you expected read-only

Check `GET /health` for `"read_only"`. Set `STARSHIPIT_WMS_READ_ONLY=true` and restart. MCP clients may cache the tool list — reconnect the integration.

## Evaluations

[`evals/evaluation.xml`](evals/evaluation.xml) holds 10 independent read-only questions for maintainer testing. Fill answers against a live WMS account before running evaluation scripts. Prefer IDs and stable master-data facts over stock quantities.

## License

[MIT](LICENSE)

## Security

See [SECURITY.md](SECURITY.md) for credential handling and vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
