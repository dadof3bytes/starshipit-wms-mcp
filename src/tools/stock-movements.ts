import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, PageSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const FilterShape = {
  search: z.string().optional(),
  product: z.string().optional(),
  productId: z.string().optional(),
  reason: z.string().optional(),
  location: z.string().optional(),
  fromLocation: z.string().optional(),
  batchNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  expiryStartDate: z.string().optional(),
  expiryEndDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.string().optional()
};

const ListSchema = withResponseFormat({
  ...FilterShape,
  paginate: z.boolean().default(true),
  page: PageSchema,
  limit: z.number().int().min(1).max(1000).default(50).describe("Page size, maximum 1000")
});

const ExportSchema = withResponseFormat(FilterShape);

const CreateSchema = withResponseFormat({
  productId: IdSchema.describe("Product ID"),
  locationId: IdSchema.describe("Target location for adjustments; one side of a transfer"),
  change: z.number().int().refine((value) => value !== 0, "change must be a non-zero integer")
    .describe("Signed whole-unit quantity. For transfers, positive change moves from transferLocationId to locationId."),
  reason: z.string().min(1).describe("Configured stock-adjustment reason, or transfer reason"),
  reference: z.string().optional().describe("Source-system reference used to reconcile retries. Strongly recommended."),
  transferLocationId: z.string().optional().describe("Other location for a transfer. Cannot combine with inventoryId."),
  inventoryId: z.string().optional().describe("Specific inventory row for a manual adjustment. Not for transfers."),
  batchNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  specificBatch: z.string().optional(),
  specificSerial: z.string().optional(),
  expiryDate: z.string().optional(),
  performedBy: PerformedBySchema
});

export function registerStockMovementTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_stock_movements",
    title: "List Stock Movements",
    description: `List stock movements with filters. page is 1-based, limit max 1000.

Use search=reference after an uncertain write to see if the movement already landed.
Do not treat this as a create.`,
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/stock-movement", omitUndefined({
        search: params.search,
        product: params.product,
        productId: params.productId,
        reason: params.reason,
        location: params.location,
        fromLocation: params.fromLocation,
        batchNumber: params.batchNumber,
        serialNumber: params.serialNumber,
        startDate: params.startDate,
        endDate: params.endDate,
        expiryStartDate: params.expiryStartDate,
        expiryEndDate: params.expiryEndDate,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
        paginate: params.paginate,
        page: params.page,
        limit: params.limit
      }));
      return wrapList(
        data,
        "movements",
        pickItems(data, ["stockMovements", "items", "data", "movements"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Stock Movements",
        params.page
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_export_stock_movements",
    title: "Export Stock Movements",
    description: "Export filtered stock movements. Same filters as list, without pagination.",
    inputSchema: ExportSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/stock-movement/export", omitUndefined({
        search: params.search,
        product: params.product,
        productId: params.productId,
        reason: params.reason,
        location: params.location,
        fromLocation: params.fromLocation,
        batchNumber: params.batchNumber,
        serialNumber: params.serialNumber,
        startDate: params.startDate,
        endDate: params.endDate,
        expiryStartDate: params.expiryStartDate,
        expiryEndDate: params.expiryEndDate,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Stock Movement Export");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_stock_movement",
    title: "Create Stock Movement",
    description: `Adjust or transfer stock. This changes warehouse inventory.

For transfers: set transferLocationId. Positive change moves stock from transferLocationId to locationId.
Always send a unique reference. There is no idempotency key.
If the call times out: search movements by reference and re-read inventory at both locations. Retry only if the first request did not change stock.
409 means available stock changed — re-read first.`,
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/stock-movement", omitUndefined({
        productId: params.productId,
        locationId: params.locationId,
        change: params.change,
        reason: params.reason,
        reference: params.reference,
        transferLocationId: params.transferLocationId,
        inventoryId: params.inventoryId,
        batchNumber: params.batchNumber,
        serialNumber: params.serialNumber,
        specificBatch: params.specificBatch,
        specificSerial: params.specificSerial,
        expiryDate: params.expiryDate,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Stock Movement");
    }
  });
}
