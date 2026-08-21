import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost, wmsPut } from "../services/wms-client.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({});

const GetSchema = withResponseFormat({
  id: IdSchema.describe("WMS supplier ID")
});

const CreateSchema = withResponseFormat({
  name: z.string().min(1).describe("Non-empty supplier name"),
  email: z.string().nullable().optional().describe("Valid email, or null/empty for no email")
});

const UpdateSchema = withResponseFormat({
  id: IdSchema.describe("WMS supplier ID"),
  name: z.string().min(1).describe("Non-empty supplier name"),
  email: z.string().nullable().optional().describe("Valid email, or null/empty to clear")
});

export function registerSupplierTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_suppliers",
    title: "List WMS Suppliers",
    description: "List suppliers. Store the supplier id for purchase-order create. Do not substitute the name for later ID fields unless the create-PO tool allows supplierName.",
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/supplier");
      return wrapList(
        data,
        "suppliers",
        pickItems(data, ["suppliers", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Suppliers"
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_supplier",
    title: "Get WMS Supplier",
    description: "Get one supplier by WMS supplier ID.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/supplier/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Supplier");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_supplier",
    title: "Create WMS Supplier",
    description: "Create a supplier. name is required. Match by name before retrying a timed-out create.",
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/supplier", omitUndefined({
        name: params.name,
        email: params.email
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Created Supplier");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_update_supplier",
    title: "Update WMS Supplier",
    description: "Update a supplier. Pass null or empty email to clear it.",
    inputSchema: UpdateSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPut<unknown>(`/api/supplier/${encodeURIComponent(params.id)}`, omitUndefined({
        name: params.name,
        email: params.email
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Updated Supplier");
    }
  });
}
