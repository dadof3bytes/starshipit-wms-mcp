import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { registerDefinedTool, wrapRecord } from "./helpers.js";

const GenerateSchema = withResponseFormat({
  action: z.string().optional().describe("preview to review suggested lines, create to create jobs from reviewed items"),
  maxOrders: z.number().int().min(1).max(500).optional(),
  strategy: z.string().optional().describe("MINIMUM or MAXIMUM. Used when action=preview."),
  items: z.array(z.object({
    productId: z.string().min(1),
    locationId: z.string().min(1),
    quantity: z.number().int().min(1)
  }).strict()).optional().describe("Required when action=create. 1-500 lines."),
  performedBy: PerformedBySchema
});

const ManualSchema = withResponseFormat({
  items: z.array(z.object({
    productId: z.string().min(1),
    locationId: z.string().min(1),
    quantity: z.number(),
    priority: z.number().optional()
  }).strict()).optional(),
  productId: z.string().optional(),
  locationId: z.string().optional(),
  quantity: z.number().optional(),
  priority: z.number().optional(),
  performedBy: PerformedBySchema
});

const LinesSchema = withResponseFormat({
  id: IdSchema.describe("Replenishment job ID")
});

const PickPlaceSchema = withResponseFormat({
  id: IdSchema.describe("Replenishment job ID"),
  equipmentLocationId: IdSchema.describe("Equipment location"),
  replenishmentLineId: z.string().optional().describe("Required when the job has multiple lines"),
  quantity: z.number().int().positive(),
  performedBy: PerformedBySchema
});

const CombineSchema = withResponseFormat({
  jobIds: z.array(z.string().min(1)).min(2).describe("At least two READY allocated replenishment job IDs"),
  performedBy: PerformedBySchema
});

export function registerReplenishmentTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_replenishment_lines",
    title: "List Replenishment Lines",
    description: "List lines on a replenishment job ID.",
    inputSchema: LinesSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/replenishment/${encodeURIComponent(params.id)}/lines`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Replenishment Lines");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_generate_replenishment_from_demand",
    title: "Generate Replenishment From Demand",
    description: "Preview or create replenishment jobs from demand. Use action=preview first, then action=create with reviewed items.",
    inputSchema: GenerateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/replenishment/generate-from-demand", omitUndefined({
        action: params.action,
        maxOrders: params.maxOrders,
        strategy: params.strategy,
        items: params.items,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Generate Replenishment");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_manual_replenishments",
    title: "Create Manual Replenishments",
    description: "Create manual replenishment jobs. Prefer items[]. Legacy single-line productId/locationId/quantity is also accepted.",
    inputSchema: ManualSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/replenishment/manual", omitUndefined({
        items: params.items,
        productId: params.productId,
        locationId: params.locationId,
        quantity: params.quantity,
        priority: params.priority,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Manual Replenishments");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_pick_replenishment",
    title: "Pick Replenishment Stock",
    description: "Pick replenishment stock onto equipment. quantity must be a positive whole number.",
    inputSchema: PickPlaceSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/replenishment/${encodeURIComponent(params.id)}/pick`, omitUndefined({
        equipmentLocationId: params.equipmentLocationId,
        replenishmentLineId: params.replenishmentLineId,
        quantity: params.quantity,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Pick Replenishment");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_place_replenishment",
    title: "Place Replenishment Stock",
    description: "Place picked replenishment stock. quantity must match the line quantity.",
    inputSchema: PickPlaceSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/replenishment/${encodeURIComponent(params.id)}/replenish`, omitUndefined({
        equipmentLocationId: params.equipmentLocationId,
        replenishmentLineId: params.replenishmentLineId,
        quantity: params.quantity,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Place Replenishment");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_combine_replenishment_jobs",
    title: "Combine Replenishment Jobs",
    description: "Combine at least two READY allocated replenishment jobs.",
    inputSchema: CombineSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/replenishment/combine", omitUndefined({
        jobIds: params.jobIds,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Combine Replenishment Jobs");
    }
  });
}
