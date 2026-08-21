import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { omitToolMeta, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({});

const CreateSchema = withResponseFormat({
  name: z.string().min(1).describe("Package name"),
  code: z.string().optional().describe("Package code. Defaults to name when omitted."),
  type: z.string().optional().describe("Package type label"),
  weight: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  length: z.number().min(0).optional()
});

export function registerPackageTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_packages",
    title: "List WMS Packages",
    description: "List packaging materials and containers configured for shipping.",
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/package");
      return wrapList(
        data,
        "packages",
        pickItems(data, ["packages", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Packages"
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_package",
    title: "Create WMS Package",
    description: "Create a packaging type. name is required. code must be unique if supplied.",
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/package", omitUndefined(omitToolMeta(params)));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Created Package");
    }
  });
}
