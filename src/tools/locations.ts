import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { IdSchema, PageSchema, omitToolMeta, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  filter: z.string().optional().describe("Helper filter or LocationType. Helpers include tote and available-tote."),
  search: z.string().optional().describe("Case-insensitive name, barcode, or zone-name search"),
  equipmentLocationId: z.string().optional().describe("Limit tote results to totes on this equipment location"),
  compact: z.boolean().optional().describe("When true, return only id, name, type, parentLocationId"),
  includeOccupancy: z.boolean().optional().describe("When true, append occupancy fields"),
  isDefaultStocktake: z.boolean().optional(),
  page: z.number().int().min(1).optional().describe("1-based page. Provide with limit."),
  limit: z.number().int().min(1).max(100).optional().describe("Rows per page, 1-100. Required when page is set.")
});

const GetSchema = withResponseFormat({
  id: IdSchema.describe("WMS location ID")
});

const CreateSchema = withResponseFormat({
  name: z.string().min(1).describe("Location name (required)"),
  type: z.string().optional().describe("Location type. Defaults to PICK_FACE."),
  barcode: z.string().nullable().optional(),
  minCapacity: z.number().min(0).nullable().optional(),
  maxCapacity: z.number().min(0).nullable().optional(),
  allowMixedClientStock: z.boolean().optional(),
  setAsDefaultStocktake: z.boolean().optional(),
  allowedProductIds: z.array(z.string()).optional(),
  sequence: z.number().int().min(0).nullable().optional(),
  parentLocationId: z.string().nullable().optional(),
  childToteIds: z.array(z.string()).optional().describe("Tote IDs. Only valid for EQUIPMENT locations."),
  zoneId: z.string().nullable().optional()
});

export function registerLocationTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_locations",
    title: "List WMS Locations",
    description: `List warehouse locations. Store location id values — later writes cannot use names or barcodes.

When page is supplied, limit is required (max 100).
Use includeOccupancy=true to see occupiedProductIds and totalQuantityOnHand.`,
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/location", omitUndefined({
        filter: params.filter,
        search: params.search,
        equipmentLocationId: params.equipmentLocationId,
        compact: params.compact,
        includeOccupancy: params.includeOccupancy,
        isDefaultStocktake: params.isDefaultStocktake,
        page: params.page,
        limit: params.limit
      }));
      return wrapList(
        data,
        "locations",
        pickItems(data, ["locations", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Locations",
        params.page
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_location",
    title: "Get WMS Location",
    description: "Get one location by WMS location ID.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/location/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Location");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_location",
    title: "Create WMS Location",
    description: "Create a location. Only name is required; type defaults to PICK_FACE. Names must be unique.",
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/location", omitUndefined(omitToolMeta(params)));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Created Location");
    }
  });
}
