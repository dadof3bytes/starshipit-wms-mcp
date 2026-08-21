# starshipit-wms-mcp-server

Streamable HTTP MCP server for the [Starshipit WMS API](https://support.starshipit.com/developers/api-reference/wms). Built so [Viktor](https://viktor.com) can add one public `/mcp` URL and run warehouse workflows.

This server covers WMS only (`https://wms.starshipit.com`). Orders, labels, rates, manifests, and tracking stay on `https://api.starshipit.com` and are out of scope.

## Connect Viktor

1. Deploy this service on HTTPS. The public URL must be the MCP endpoint, for example `https://your-host.example/mcp`.
2. In Viktor open **Integrations → Add custom MCP** and paste that URL.
3. Viktor probes the server. Unauthenticated requests return `401` with `WWW-Authenticate: Bearer` and **no** OAuth metadata, so Viktor asks for a static key.
4. Paste the Starshipit **API key** from **Settings → API** for the WMS-enabled account.
5. First test: ask Viktor to list the loaded tools, then pull inventory for a known SKU or READY pick jobs.

Keep `STARSHIPIT_WMS_READ_ONLY=true` until write tools are reviewed. That hides receive, stock movements, pick/pack, stocktake, and other mutations.

## Authentication

Every `/mcp` request (except `GET /health`) needs a key, in this order:

1. `Authorization: Bearer <key>`
2. `x-api-key`
3. `starshipit-api-key`
4. Local/dev only: `STARSHIPIT_API_KEY`

The value is forwarded to WMS as `starshipit-api-key`. It is never logged or returned by tools.

Do **not** send `Ocp-Apim-Subscription-Key` on WMS calls. That header is for the shipping API only.

## Local development

```bash
npm install
cp .env.example .env
# set STARSHIPIT_API_KEY for Inspector / stdio
npm run build
TRANSPORT=http HOST=127.0.0.1 PORT=3000 npm start
```

Health check: `GET http://127.0.0.1:3000/health`

MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://127.0.0.1:3000/mcp` with Streamable HTTP. Send the Starshipit key as `Authorization: Bearer <key>` or `starshipit-api-key`.

Stdio (local only):

```bash
TRANSPORT=stdio STARSHIPIT_API_KEY=... node dist/index.js
```

## Environment

| Variable | Purpose |
| --- | --- |
| `TRANSPORT` | `http` (default) or `stdio` |
| `PORT` | HTTP port, default `3000` |
| `HOST` | Bind address. Use `127.0.0.1` locally and `0.0.0.0` in production |
| `ALLOWED_HOSTS` | Comma-separated Host values allowed when binding publicly |
| `STARSHIPIT_API_KEY` | Local fallback only. Viktor supplies the key per request |
| `STARSHIPIT_WMS_READ_ONLY` | `true` hides and skips registration of write tools |

## Behaviour notes

- Developer API access is limited to **2 requests per second**. The client serializes outbound WMS calls and retries `429` with backoff.
- Follow-up actions need **record IDs**, not SKUs, barcodes, location names, or order numbers.
- Use `quantityAvailable` for stock decisions, not only `quantityOnHand`.
- Writes have **no idempotency keys**. Re-read before retrying. `409` means warehouse state changed.
- Receiving can return HTTP 200 with `"success": false`. That is treated as a tool error.
- Pause and resume jobs only through the dedicated tools, not `starshipit_wms_update_job`.
- Responses over 25,000 characters are truncated with a paging hint.

## Tool groups

80 tools are registered when writes are enabled (79 WMS operations plus `starshipit_wms_whoami`). `STARSHIPIT_WMS_READ_ONLY=true` registers the 34 read/lookup tools only.

Read tools (always registered): whoami, inventory, products, locations, packages, jobs, suppliers, purchase orders, stock movements, allocations, pick/pack/putaway/kitting/replenishment reads, analytics.

Write tools (hidden when `STARSHIPIT_WMS_READ_ONLY=true`): product/supplier/location/package mutations, PO create/receive, stock movements, job assign/pause/resume, pick/pack/putaway/replenish/kitting/stocktake.

The field-level contract is vendored from Starshipit as [`docs/wms-reference.json`](docs/wms-reference.json).

## Evaluations

[`evals/evaluation.xml`](evals/evaluation.xml) holds 10 independent read-only questions. Fill the answers against a live WMS account before running the mcp-builder evaluation scripts. Live quantities change, so prefer IDs and stable master-data facts.

## Deploy

Build and run `node dist/index.js` with `TRANSPORT=http`, `HOST=0.0.0.0`, `ALLOWED_HOSTS` set to the public hostname, and `STARSHIPIT_WMS_READ_ONLY=true` until write access is approved. A sample Dockerfile is included for Coolify or any container host.
