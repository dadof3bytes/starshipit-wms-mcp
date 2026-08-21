import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { registerDefinedTool, wrapRecord } from "./helpers.js";

const GetSchema = withResponseFormat({
  jobId: IdSchema.describe("Kitting job ID")
});

const CreateSchema = withResponseFormat({
  bundleProductId: IdSchema.describe("ID of a BUNDLE product"),
  quantityRequested: z.number().positive().describe("Positive number of bundles to kit"),
  priority: z.number().optional(),
  performedBy: PerformedBySchema
});

const ProcessSchema = withResponseFormat({
  jobId: IdSchema.describe("Kitting job ID"),
  kitLocationId: IdSchema.describe("Location where components are assembled and bundle inventory is created"),
  bundleBatchNumber: z.string().optional(),
  bundleExpiryDate: z.string().optional(),
  bundleSerialNumbers: z.array(z.string()).optional(),
  userId: z.string().optional(),
  performedBy: PerformedBySchema
});

export function registerKittingTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_get_kitting_job",
    title: "Get Kitting Job",
    description: "Get kitting job details by job ID.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/kitting/${encodeURIComponent(params.jobId)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Kitting Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_kitting_job",
    title: "Create Kitting Job",
    description: "Create a kitting job for a BUNDLE product. Fails if the product is not a bundle or component inventory is insufficient.",
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/kitting", omitUndefined({
        bundleProductId: params.bundleProductId,
        quantityRequested: params.quantityRequested,
        priority: params.priority,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Created Kitting Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_allocate_kitting_job",
    title: "Allocate Kitting Components",
    description: "Allocate components for a kitting job.",
    inputSchema: GetSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/kitting/${encodeURIComponent(params.jobId)}/allocate`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Allocate Kitting");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_process_kitting_job",
    title: "Process Kitting Job",
    description: "Complete a kitting job and create bundle inventory at kitLocationId. This changes stock.",
    inputSchema: ProcessSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/kitting/${encodeURIComponent(params.jobId)}/process`, omitUndefined({
        kitLocationId: params.kitLocationId,
        bundleBatchNumber: params.bundleBatchNumber,
        bundleExpiryDate: params.bundleExpiryDate,
        bundleSerialNumbers: params.bundleSerialNumbers,
        userId: params.userId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Process Kitting");
    }
  });
}
