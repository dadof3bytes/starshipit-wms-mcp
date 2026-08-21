import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet } from "../services/wms-client.js";
import { omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { registerDefinedTool, wrapRecord } from "./helpers.js";

const PerformanceSchema = withResponseFormat({
  daysBack: z.number().min(1).max(90).optional().describe("Days to include, clamped 1-90")
});

const StaffSchema = withResponseFormat({
  daysBack: z.number().optional(),
  processTypes: z.string().optional().describe("Comma-separated process types"),
  userNames: z.string().optional().describe("Comma-separated user names")
});

const UserSchema = withResponseFormat({
  userName: z.string().min(1).describe("User name (will be URL-encoded)"),
  daysBack: z.number().optional(),
  processTypes: z.string().optional()
});

const CogsSchema = withResponseFormat({
  startDate: z.string().optional().describe("YYYY-MM-DD or ISO instant"),
  endDate: z.string().optional().describe("YYYY-MM-DD or ISO instant"),
  clientId: z.string().optional(),
  timezoneMinutesOffset: z.number().int().min(-840).max(840).optional(),
  format: z.string().optional().describe("json or csv")
});

const ReplenReportSchema = withResponseFormat({
  search: z.string().optional(),
  clientId: z.string().optional(),
  status: z.string().optional().describe("open, all, or comma-separated statuses"),
  createdAfter: z.string().optional().describe("YYYY-MM-DD"),
  createdBefore: z.string().optional().describe("YYYY-MM-DD"),
  limit: z.number().int().min(1).max(5000).optional().describe("Default 1000, max 5000"),
  format: z.string().optional().describe("json or csv")
});

export function registerAnalyticsTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_get_performance_analytics",
    title: "Get Performance Analytics",
    description: "Warehouse performance analytics for the last N days (1-90).",
    inputSchema: PerformanceSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/analytics/performance", omitUndefined({ daysBack: params.daysBack }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Performance Analytics");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_staff_performance",
    title: "Get Team Staff Performance",
    description: "Team staff performance. Filter with daysBack, processTypes, and userNames.",
    inputSchema: StaffSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/analytics/staff-performance", omitUndefined({
        daysBack: params.daysBack,
        processTypes: params.processTypes,
        userNames: params.userNames
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Staff Performance");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_user_activity",
    title: "Get Individual User Activity",
    description: "Activity for one warehouse user name.",
    inputSchema: UserSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(
        `/api/analytics/staff-performance/${encodeURIComponent(params.userName)}`,
        omitUndefined({ daysBack: params.daysBack, processTypes: params.processTypes })
      );
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, `Activity ${params.userName}`);
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_cogs_report",
    title: "Get Declared Value vs COGS Report",
    description: "Declared value vs COGS report. startDate must be before endDate. format is json or csv.",
    inputSchema: CogsSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/reports/cogs", omitUndefined({
        startDate: params.startDate,
        endDate: params.endDate,
        clientId: params.clientId,
        timezoneMinutesOffset: params.timezoneMinutesOffset,
        format: params.format
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "COGS Report");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_replenishment_jobs_report",
    title: "Get Replenishment Jobs Report",
    description: "Replenishment jobs report. status may be open, all, or a comma-separated status list.",
    inputSchema: ReplenReportSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/reports/replenishment-jobs", omitUndefined({
        search: params.search,
        clientId: params.clientId,
        status: params.status,
        createdAfter: params.createdAfter,
        createdBefore: params.createdBefore,
        limit: params.limit,
        format: params.format
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Replenishment Jobs Report");
    }
  });
}
