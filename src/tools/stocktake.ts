import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { registerDefinedTool, wrapRecord } from "./helpers.js";

const Schema = withResponseFormat({
  adjustments: z.array(z.object({
    productId: z.string().min(1),
    newQuantity: z.number().int().min(0).optional().describe("Legacy aggregate non-negative quantity"),
    counts: z.array(z.object({
      locationId: z.string().optional().describe("Defaults to the account stocktake location"),
      countedQuantity: z.number().int().min(0).describe("Non-negative counted quantity. Serial counts cannot exceed 1."),
      batchNumber: z.string().nullable().optional(),
      serialNumber: z.string().nullable().optional(),
      expiryDate: z.string().nullable().optional(),
      inventoryId: z.string().optional(),
      supplierId: z.string().nullable().optional(),
      purchaseOrderRef: z.string().nullable().optional(),
      costPrice: z.number().min(0).nullable().optional()
    }).strict()).optional()
  }).strict()).min(1),
  performedBy: PerformedBySchema
});

export function registerStocktakeTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_perform_stocktake",
    title: "Perform Stocktake Adjustments",
    description: `Apply stocktake counts. This adjusts live inventory and is destructive.

Prefer counts[] grouped by location and tracking values over legacy newQuantity.
Re-read inventory before and after. Do not retry a timed-out stocktake until you have confirmed current quantities.`,
    inputSchema: Schema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/stocktake", omitUndefined({
        adjustments: params.adjustments,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Stocktake");
    }
  });
}
