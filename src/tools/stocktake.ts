import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const PerformSchema = withResponseFormat({
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

const ListApprovalsSchema = withResponseFormat({});

const DecideSchema = withResponseFormat({
  runId: IdSchema.describe("UUID process-run ID from list_stocktake_approvals or perform_stocktake response"),
  action: z.enum(["approve", "decline"]).describe("Approve queues inventory processing; decline cancels without applying counts")
});

export function registerStocktakeTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_stocktake_approvals",
    title: "List Stocktake Submissions",
    description: `List pending stocktake approvals and up to 100 recent non-pending submissions. Requires stocktake.approve permission.

No pagination parameters. Store the id / processRunId for decide_stocktake.`,
    inputSchema: ListApprovalsSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/stocktake/approval");
      return wrapList(
        data,
        "stocktakes",
        pickItems(data, ["stocktakes", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Stocktake Submissions"
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_decide_stocktake",
    title: "Approve or Decline Stocktake",
    description: `Decide a pending stocktake submission. Requires stocktake.approve permission.

Approval queues asynchronous inventory processing — it does not mean inventory has finished updating.
Decline cancels the submission without applying counts.
Re-read list_stocktake_approvals before retrying. 409 means the submission is no longer pending or another stocktake is processing.`,
    inputSchema: DecideSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(
        `/api/stocktake/approval/${encodeURIComponent(params.runId)}`,
        { action: params.action }
      );
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Stocktake Decision");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_perform_stocktake",
    title: "Perform Stocktake Adjustments",
    description: `Submit stocktake counts. Requires stocktake.count permission. Callers with stocktake.approve queue processing immediately; others submit for approval first.

Prefer counts[] grouped by location and tracking values over legacy newQuantity.
Re-read inventory before and after. Do not retry a timed-out stocktake until you have confirmed current quantities.
Store processRunId from the response for approval workflows.`,
    inputSchema: PerformSchema,
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
