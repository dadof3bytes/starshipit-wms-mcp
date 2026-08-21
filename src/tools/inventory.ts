import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { IdSchema, PageSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  viewMode: z.string().optional().describe("Group results by product or location. Documented values include product and location."),
  sortBy: z.string().optional().describe("Server-side sort key"),
  sortDirection: z.string().optional().describe("Sort direction"),
  page: PageSchema,
  pageSize: z.number().int().min(1).max(100).default(25).describe("Page size, maximum 100"),
  search: z.string().optional().describe("Product view matches SKU, name, barcode. Location view matches location names and nested products."),
  filter: z.string().optional().describe("Optional inventory filter"),
  inStockOnly: z.boolean().optional().describe("When true, only return in-stock rows"),
  productType: z.string().optional().describe("Filter by product type"),
  clientId: z.string().optional().describe("Product view only. Limit to a client.")
});

const GetSchema = withResponseFormat({
  productId: IdSchema.describe("WMS product ID from list or SKU lookup. Not a SKU."),
  canonical: z.boolean().optional().describe("When true, return canonical inventory detail")
});

const ValidateSchema = withResponseFormat({
  productId: IdSchema.describe("Product ID to validate"),
  batchNumber: z.string().optional().describe("Batch number for a batch-tracked product"),
  serialNumber: z.string().optional().describe("Serial number for a serial-tracked product"),
  locationId: z.string().optional().describe("Optional location scope"),
  containerId: z.string().nullable().optional().describe("Optional container scope"),
  checkAvailability: z.boolean().optional().describe("Check available quantity instead of a batch or serial")
});

export function registerInventoryTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_inventory",
    title: "List WMS Inventory",
    description: `List paginated inventory grouped by product or location.

Use quantityAvailable for stock-consuming decisions, not only quantityOnHand.
Follow-up tools need productId and locationId, not SKU or location name.

Args:
  - viewMode, search, page, pageSize (max 100), filters
  - response_format

Returns: items plus total_count, page, has_more, next_page.

Use when: "what is on hand for SKU X" (search=SKU, viewMode=product) or "where is this stored" (viewMode=location).
Do not use when: you already have productId and need one product (use starshipit_wms_get_inventory).`,
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/inventory", omitUndefined({
        viewMode: params.viewMode,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        filter: params.filter,
        inStockOnly: params.inStockOnly,
        productType: params.productType,
        clientId: params.clientId
      }));
      return wrapList(
        data,
        "items",
        pickItems(data, ["items"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Inventory",
        params.page
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_inventory",
    title: "Get Product Inventory Detail",
    description: `Get detailed inventory for one product ID, including location breakdowns.

Args:
  - productId (required WMS product ID)
  - canonical (optional)
  - response_format

Use quantityAvailable before allocating or moving stock.
Use when: you have a productId from starshipit_wms_get_product_by_sku or list_inventory.
Do not use when: you only have a SKU — look up the product first.`,
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/inventory/${encodeURIComponent(params.productId)}`, omitUndefined({
        canonical: params.canonical
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Product Inventory");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_validate_inventory",
    title: "Validate Batch, Serial, or Availability",
    description: `Validate that a batch/serial exists with stock, or check available quantity for a product.

Provide productId plus batchNumber, serialNumber, or checkAvailability=true. Optionally scope with locationId/containerId.

Use before allocating tracked stock. This does not create a movement.`,
    inputSchema: ValidateSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/inventory/validate", omitUndefined({
        productId: params.productId,
        batchNumber: params.batchNumber,
        serialNumber: params.serialNumber,
        locationId: params.locationId,
        containerId: params.containerId,
        checkAvailability: params.checkAvailability
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Inventory Validation");
    }
  });
}
