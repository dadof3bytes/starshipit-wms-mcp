import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsDelete, wmsGet, wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { registerDefinedTool, wrapRecord } from "./helpers.js";

const GetSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID")
});

const BeginSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID"),
  userId: z.string().optional(),
  pickMode: z.string().optional().describe("standard or tote"),
  performedBy: PerformedBySchema
});

const PickSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID"),
  productId: IdSchema.describe("Product ID being picked"),
  equipmentLocationId: IdSchema.describe("Equipment/cart location receiving picked stock"),
  pickedQuantity: z.number().positive().describe("Positive quantity picked"),
  userId: z.string().optional(),
  performedBy: PerformedBySchema
});

const StageSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID"),
  productId: IdSchema,
  packingBenchLocationId: IdSchema.describe("Packing-bench destination location ID"),
  stagedQuantity: z.number().positive(),
  pickSequenceOrderIds: z.array(z.string()).optional(),
  completePickJob: z.boolean().optional(),
  userId: z.string().optional(),
  performedBy: PerformedBySchema
});

const AssignToteSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID"),
  orderId: z.string().min(1).describe("Order ID in the pick job"),
  toteLocationId: z.string().min(1).describe("Tote location to reserve"),
  equipmentLocationId: z.string().optional(),
  performedBy: PerformedBySchema
});

const ReleaseToteSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID"),
  orderId: z.string().min(1).describe("Order ID whose tote assignment should be released")
});

const TotePickSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID"),
  orderId: z.string().min(1),
  toteLocationId: z.string().min(1),
  productId: z.string().min(1),
  pickedQuantity: z.number().int().positive(),
  equipmentLocationId: z.string().optional(),
  sourceLocationId: z.string().optional(),
  batchNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  userId: z.string().optional(),
  performedBy: PerformedBySchema
});

const CompleteToteSchema = withResponseFormat({
  id: IdSchema.describe("Pick job ID"),
  toteAssignments: z.array(z.object({
    orderId: z.string().min(1),
    toteLocationId: z.string().min(1),
    pickedItems: z.array(z.object({
      productId: z.string().min(1),
      pickedQuantity: z.number().int().min(0)
    }).strict()).optional()
  }).strict()).min(1),
  userId: z.string().optional(),
  equipmentLocationId: z.string().optional(),
  performedBy: PerformedBySchema
});

export function registerPickingTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_get_pick_job",
    title: "Get Pick Job Details",
    description: "Get pick-job details by job ID. Re-read before begin/pick/stage.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/picking/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Pick Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_list_tote_assignments",
    title: "List Tote Assignments",
    description: "List tote-to-order assignments for a pick job.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/picking/${encodeURIComponent(params.id)}/tote-assignments`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Tote Assignments");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_begin_pick_job",
    title: "Begin Pick Job",
    description: "Start a pick job. pickMode is standard or tote. Confirm the job is still READY first.",
    inputSchema: BeginSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/picking/${encodeURIComponent(params.id)}/begin`, omitUndefined({
        userId: params.userId,
        pickMode: params.pickMode,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Begin Pick Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_process_pick",
    title: "Process Pick",
    description: "Record a pick onto an equipment location. pickedQuantity must be positive. Confirm the job has not already progressed.",
    inputSchema: PickSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/picking/${encodeURIComponent(params.id)}/pick`, omitUndefined({
        productId: params.productId,
        equipmentLocationId: params.equipmentLocationId,
        pickedQuantity: params.pickedQuantity,
        userId: params.userId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Process Pick");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_stage_picked_items",
    title: "Stage Picked Items",
    description: "Stage picked stock onto a packing bench. Optionally complete the pick job.",
    inputSchema: StageSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/picking/${encodeURIComponent(params.id)}/stage`, omitUndefined({
        productId: params.productId,
        packingBenchLocationId: params.packingBenchLocationId,
        stagedQuantity: params.stagedQuantity,
        pickSequenceOrderIds: params.pickSequenceOrderIds,
        completePickJob: params.completePickJob,
        userId: params.userId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Stage Picked Items");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_assign_tote",
    title: "Assign Tote To Order",
    description: "Reserve a tote location for an order in a pick job.",
    inputSchema: AssignToteSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/picking/${encodeURIComponent(params.id)}/tote-assignments`, omitUndefined({
        orderId: params.orderId,
        toteLocationId: params.toteLocationId,
        equipmentLocationId: params.equipmentLocationId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Assign Tote");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_release_tote",
    title: "Release Tote Assignment",
    description: "Release a tote assignment for an order in a pick job.",
    inputSchema: ReleaseToteSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsDelete<unknown>(
        `/api/picking/${encodeURIComponent(params.id)}/tote-assignments/${encodeURIComponent(params.orderId)}`
      );
      return wrapRecord(data ?? { released: true, orderId: params.orderId }, params.response_format ?? ResponseFormat.MARKDOWN, "Release Tote");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_process_tote_pick",
    title: "Process Tote Pick Item",
    description: "Pick one item into a reserved tote. pickedQuantity must be a positive integer.",
    inputSchema: TotePickSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/picking/${encodeURIComponent(params.id)}/tote-pick`, omitUndefined({
        orderId: params.orderId,
        toteLocationId: params.toteLocationId,
        productId: params.productId,
        pickedQuantity: params.pickedQuantity,
        equipmentLocationId: params.equipmentLocationId,
        sourceLocationId: params.sourceLocationId,
        batchNumber: params.batchNumber,
        serialNumber: params.serialNumber,
        userId: params.userId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Tote Pick");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_complete_tote_pick",
    title: "Complete Tote Pick",
    description: "Complete a tote pick with order/tote assignments and optional partial picked-item overrides.",
    inputSchema: CompleteToteSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/picking/${encodeURIComponent(params.id)}/complete-tote-pick`, omitUndefined({
        toteAssignments: params.toteAssignments,
        userId: params.userId,
        equipmentLocationId: params.equipmentLocationId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Complete Tote Pick");
    }
  });
}
