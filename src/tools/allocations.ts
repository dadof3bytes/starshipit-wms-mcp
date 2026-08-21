import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsDelete, wmsGet } from "../services/wms-client.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  view: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  health: z.string().optional(),
  page: z.number().int().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().positive().optional()
});

const DeleteSchema = withResponseFormat({
  id: IdSchema.describe("Manual allocation ID"),
  reason: z.string().optional().describe("Optional deletion reason")
});

export function registerAllocationTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_allocations",
    title: "List Allocations",
    description: "List inventory allocations for orders and jobs. Filter with view, status, search, or health.",
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/allocation", omitUndefined({
        view: params.view,
        status: params.status,
        search: params.search,
        health: params.health,
        page: params.page,
        offset: params.offset,
        limit: params.limit
      }));
      return wrapList(
        data,
        "allocations",
        pickItems(data, ["allocations", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Allocations",
        params.page
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_delete_allocation",
    title: "Delete Manual Allocation",
    description: "Delete a manual allocation by ID. Confirm it is a manual allocation first. Destructive.",
    inputSchema: DeleteSchema,
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsDelete<unknown>(
        `/api/allocation/${encodeURIComponent(params.id)}`,
        omitUndefined({ reason: params.reason })
      );
      return wrapRecord(data ?? { deleted: true, id: params.id }, params.response_format ?? ResponseFormat.MARKDOWN, "Deleted Allocation");
    }
  });
}
