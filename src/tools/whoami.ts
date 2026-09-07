import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wmsGet } from "../services/wms-client.js";
import { withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { registerDefinedTool, wrapRecord } from "./helpers.js";

const InputSchema = withResponseFormat({});

export function registerWhoamiTool(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_whoami",
    title: "Verify Starshipit WMS Access",
    description: `Check that the supplied Starshipit API key can reach the WMS account.

Calls GET /api/inventory with page=1 and pageSize=1. Does not return the API key.

Args:
  - response_format (markdown|json): Output format (default markdown)

Returns:
  Whether the key can read inventory, plus the first product summary if present.

Use when: confirming your MCP client is authenticated before other tools.
Do not use when: you already have a product ID and need stock detail (use starshipit_wms_get_inventory).

Error Handling:
  - 401: replace the Starshipit API key
  - 403/404: confirm the key belongs to a WMS-enabled account`,
    inputSchema: InputSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/inventory", { viewMode: "product", page: 1, pageSize: 1 });
      const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
      const items = Array.isArray(record.items) ? record.items : [];
      const first = items[0] && typeof items[0] === "object"
        ? items[0] as Record<string, unknown>
        : undefined;
      return wrapRecord({
        connected: true,
        can_read_inventory: true,
        sample_product: first
          ? { id: first.id, sku: first.sku, name: first.name, quantityAvailable: first.quantityAvailable }
          : null,
        total_count: record.totalCount ?? null
      }, params.response_format ?? ResponseFormat.MARKDOWN, "WMS Connection");
    }
  });
}
