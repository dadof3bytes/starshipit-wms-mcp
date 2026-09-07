# Security

## Reporting a vulnerability

If you find a security issue in this MCP server (not in Starshipit WMS itself), open a [GitHub Security Advisory](https://github.com/dadof3bytes/starshipit-wms-mcp/security/advisories/new) or email the repository maintainer privately.

Please do **not** open a public issue for undisclosed vulnerabilities.

## How this server handles credentials

- Callers send a Starshipit API key on each MCP request (`Authorization: Bearer`, `x-api-key`, or `starshipit-api-key`).
- The server forwards that key to `https://wms.starshipit.com` as `starshipit-api-key`.
- Keys are **not** logged or returned by tools.
- For HTTP transport, set `STARSHIPIT_API_KEY` only for local development; production clients should supply the key per request.

## Deployment guidance

- Terminate TLS at your reverse proxy. Do not expose plain HTTP publicly.
- Run behind HTTPS only.
- If you set `ALLOWED_HOSTS`, it must match your public hostname exactly (see README troubleshooting).
- Treat the MCP URL as sensitive: anyone who can reach it and supply a valid Starshipit key can invoke tools.
- Start with read-only mode (`STARSHIPIT_WMS_READ_ONLY=true`) when testing a new deployment if you do not want inventory mutations yet.
- Rotate Starshipit API keys if you suspect exposure.

## Out of scope

Issues in Starshipit WMS, the Starshipit shipping API, or third-party MCP clients should be reported to those vendors.
