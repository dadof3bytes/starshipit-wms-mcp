import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPatch, wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, PageSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  status: z.string().optional().describe("Comma-separated job statuses, e.g. READY"),
  type: z.string().optional().describe("Comma-separated job types, e.g. PICK"),
  assignedUserId: z.string().optional(),
  includeAssigned: z.boolean().optional().describe("Set false to return only unassigned jobs"),
  search: z.string().optional().describe("Search display names and related order context"),
  sortBy: z.string().optional(),
  sortDirection: z.string().optional(),
  page: PageSchema,
  limit: z.number().int().min(1).max(100).default(25).describe("Page size, maximum 100"),
  paginate: z.boolean().default(true).describe("Return pagination metadata")
});

const GetSchema = withResponseFormat({
  id: IdSchema.describe("WMS job ID, not the display name or order number")
});

const AllocationsSchema = withResponseFormat({
  id: IdSchema.describe("WMS job ID"),
  status: z.string().optional().describe("Optional comma-separated allocation status filter")
});

const UpdateSchema = withResponseFormat({
  id: IdSchema.describe("WMS job ID"),
  status: z.string().optional().describe("New status. Do not set PAUSED — use starshipit_wms_pause_job."),
  assignedUserId: z.string().nullable().optional().describe("User ID to assign, or null to unassign"),
  priority: z.number().int().min(0).max(10).optional().describe("Priority 0-10"),
  performedBy: PerformedBySchema
});

const AssignSchema = withResponseFormat({
  id: IdSchema.describe("WMS job ID"),
  userId: z.string().min(1).describe("Non-empty user ID to assign"),
  performedBy: PerformedBySchema
});

const PauseSchema = withResponseFormat({
  id: IdSchema.describe("WMS job ID"),
  reasonCode: z.string().min(1).describe("Active pause reason code configured for the account"),
  userId: z.string().optional(),
  performedBy: PerformedBySchema
});

const ResumeSchema = withResponseFormat({
  id: IdSchema.describe("WMS job ID"),
  userId: z.string().optional(),
  performedBy: PerformedBySchema
});

export function registerJobTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_jobs",
    title: "List WMS Jobs",
    description: `List warehouse jobs with filters.

Ready pick queue: status=READY and type=PICK.
Store the job id. Display names and order numbers are not valid follow-up IDs.

page is 1-based, limit max 100. This tool always sends paginate=true.`,
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/job", omitUndefined({
        status: params.status,
        type: params.type,
        assignedUserId: params.assignedUserId,
        includeAssigned: params.includeAssigned,
        search: params.search,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
        page: params.page,
        limit: params.limit,
        paginate: params.paginate
      }));
      return wrapList(
        data,
        "jobs",
        pickItems(data, ["jobs", "items"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Jobs",
        params.page
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_job",
    title: "Get WMS Job",
    description: "Get one job by ID. Re-read immediately before assign/pause/resume/update.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/job/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_job_details",
    title: "Get Read-Only Job Detail View",
    description: "Get the expanded read-only job detail view for a job ID.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/job/${encodeURIComponent(params.id)}/details`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Job Details");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_job_allocations",
    title: "Get Job Allocations",
    description: "List allocations attached to a job ID. Optional status filter.",
    inputSchema: AllocationsSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(
        `/api/job/${encodeURIComponent(params.id)}/allocations`,
        omitUndefined({ status: params.status })
      );
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Job Allocations");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_update_job",
    title: "Update WMS Job",
    description: `Update status, assignment, or priority (0-10). Send only fields you intend to change.

Do not set status to PAUSED and do not resume a paused job here.
Use starshipit_wms_pause_job and starshipit_wms_resume_job.
Re-read the job before retrying. 409 means state changed.`,
    inputSchema: UpdateSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPatch<unknown>(`/api/job/${encodeURIComponent(params.id)}`, omitUndefined({
        status: params.status,
        assignedUserId: params.assignedUserId,
        priority: params.priority,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Updated Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_assign_job",
    title: "Assign WMS Job",
    description: "Assign a job to a userId. Re-read first. 409 means INVALID_STATUS or ASSIGNMENT_CONFLICT.",
    inputSchema: AssignSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/job/${encodeURIComponent(params.id)}/assign`, omitUndefined({
        userId: params.userId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Assigned Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_pause_job",
    title: "Pause WMS Job",
    description: "Pause a job. reasonCode must match an active account pause reason. Do not use update_job for PAUSED.",
    inputSchema: PauseSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/job/${encodeURIComponent(params.id)}/pause`, omitUndefined({
        reasonCode: params.reasonCode,
        userId: params.userId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Paused Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_resume_job",
    title: "Resume WMS Job",
    description: "Resume a paused job. Re-read first. 409 means the job is no longer paused or changed during the resume.",
    inputSchema: ResumeSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/job/${encodeURIComponent(params.id)}/resume`, omitUndefined({
        userId: params.userId,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Resumed Job");
    }
  });
}
