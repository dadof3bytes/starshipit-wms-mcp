import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPatch, wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  status: z.string().optional(),
  jobId: z.string().optional().describe("When provided, returns staging inventory for that putaway job"),
  includeCompleted: z.boolean().optional()
});

const EligibilitySchema = withResponseFormat({
  locationId: IdSchema.describe("Location ID to evaluate")
});

const ProcessSchema = withResponseFormat({
  jobId: IdSchema.describe("Putaway job ID"),
  lineItems: z.array(z.object({
    lineItemId: z.string().optional(),
    productId: z.string().min(1),
    quantityToPutaway: z.number().positive(),
    targetLocationId: z.string().min(1),
    batchNumber: z.string().optional(),
    serialNumber: z.string().optional(),
    expiryDate: z.string().nullable().optional(),
    costPrice: z.number().optional()
  }).strict()).min(1),
  performedBy: PerformedBySchema
});

const CancelSchema = withResponseFormat({
  jobId: IdSchema.describe("Putaway job ID to cancel"),
  performedBy: PerformedBySchema
});

export function registerPutawayTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_putaway_jobs",
    title: "List Putaway Jobs",
    description: "List putaway jobs. Filter by status or jobId (jobId returns staging inventory for that job).",
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/putaway", omitUndefined({
        status: params.status,
        jobId: params.jobId,
        includeCompleted: params.includeCompleted
      }));
      return wrapList(
        data,
        "jobs",
        pickItems(data, ["jobs", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Putaway Jobs"
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_check_putaway_eligibility",
    title: "Check Putaway Eligibility",
    description: "Check whether a location can receive putaway.",
    inputSchema: EligibilitySchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/putaway/can-create", { locationId: params.locationId });
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Putaway Eligibility");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_process_putaway",
    title: "Process Putaway",
    description: "Put received stock into destination locations. Quantity cannot exceed available. This changes inventory.",
    inputSchema: ProcessSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/putaway", omitUndefined({
        jobId: params.jobId,
        lineItems: params.lineItems,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Process Putaway");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_cancel_putaway_job",
    title: "Cancel Putaway Job",
    description: "Cancel a putaway job. Confirm current status first.",
    inputSchema: CancelSchema,
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPatch<unknown>("/api/putaway", omitUndefined({
        jobId: params.jobId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Cancel Putaway");
    }
  });
}
