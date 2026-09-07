# Contributing

Thanks for helping improve this MCP server.

## Before you start

- This is an **unofficial** community integration with the [Starshipit WMS API](https://support.starshipit.com/developers/api-reference/wms). It is not maintained by Starshipit.
- You need a Starshipit account with the **WMS add-on** to test against a live warehouse.
- Prefer matching tool schemas to the published API reference rather than inventing fields.

## Development setup

```bash
npm install
cp .env.example .env
# Set STARSHIPIT_API_KEY for local Inspector / stdio testing
npm run build
TRANSPORT=http HOST=127.0.0.1 PORT=3000 npm start
```

Run checks before opening a PR:

```bash
npm run typecheck
npm run build
```

## Adding or updating tools

1. Check the live reference: https://support.starshipit.com/developers/api-reference/wms/reference.json
2. Add the tool in the appropriate file under `src/tools/`.
3. Use `registerDefinedTool` with accurate `readOnly`, `destructive`, and `idempotent` hints.
4. Update tool counts in `README.md` if the total changes.
5. Refresh `docs/wms-reference.json` when the upstream API changes:

   ```bash
   curl -sS -o docs/wms-reference.json https://support.starshipit.com/developers/api-reference/wms/reference.json
   ```

## Dev-only files

The `.agents/` directory holds local Cursor/agent skills for maintainers. It is **not** part of the published package and is gitignored. Do not commit it.

## Pull requests

- Keep changes focused.
- Describe which WMS endpoints or workflows you touched.
- Note whether you tested read-only mode, write tools, or both.
