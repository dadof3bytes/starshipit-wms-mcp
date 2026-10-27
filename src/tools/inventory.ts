import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { IdSchema, PageSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat, type ToolOutput } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  viewMode: z.string().optional().describe("Group results by product (default) or location. Allowed: product, location."),
  sortBy: z.string().optional().describe("Product view only: sku, name, price, quantityOnHand, quantityIncoming, quantityReserved, quantityCommitted, quantityUnavailable, quantityAvailable. Other product-view fields return 400."),
  sortDirection: z.string().optional().describe("asc or desc. Used when sortBy is set."),
  page: PageSchema,
  pageSize: z.number().int().min(1).max(100).default(25).describe("Page size, maximum 100"),
  search: z.string().optional().describe("Product view matches SKU, name, barcode. Location view matches location names and nested products."),
  filter: z.string().optional().describe("Product view: all, incoming, reserved, insufficient, frozen. Location view: all, incoming, reserved, frozen."),
  inStockOnly: z.boolean().optional().describe("Product view only. When true, only products with on-hand stock."),
  productType: z.string().optional().describe("Product view: all, standard, or bundle (case-insensitive). Other values are treated as all."),
  clientId: z.string().optional().describe("Product view only. Limit to inventory owned by this client. Returns 400 with viewMode=location."),
  refresh: z.boolean().optional().describe("When true, bypass cached inventory results."),
  locationId: z.string().optional().describe("Filter either view to one location ID."),
  productId: z.string().optional().describe("Product view only. Filter the overview to one product ID. Use starshipit_wms_get_inventory for the batch/serial ledger."),
  includeHidden: z.boolean().optional().describe("Product view only. When true, include hidden products."),
  countOnly: z.boolean().optional().describe("Product view only. When true, the API returns only totalCount.")
});

const GetSchema = withResponseFormat({
  productId: IdSchema.describe("WMS product ID from list or SKU lookup. Not a SKU."),
  canonical: z.boolean().optional().describe("When true, return the canonical per-location summary. Takes precedence over forMovement. Must be true or false when supplied."),
  forMovement: z.boolean().optional().describe("When true, and canonical is not true, return the live movement ledger with movementReservations. Must be true or false when supplied.")
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

Product rows include nullable safetyStock, the product's Shopify buffer. Report it with the quantities. quantityAvailable is the stock-consuming figure; the buffer stays in safetyStock. Markdown shows safetyStock as unset when the API sends null. JSON keeps null.

Product rows also include preOrder. When the API sends them, rows can also include leadTimeDays, unitCost, inventoryValue, barcode, and UOM fields. Location summaries include quantityMovable (on-hand minus active allocations, floored at zero) and replenishmentReservations. Stock-consuming decisions still use quantityAvailable. quantityMovable is the figure for a physical move.

The response includes account restocking settings when the API sends them: restockingAnalysisWindowDays, restockingLeadTimeDays, restockingMinimumDailyBurnRate.

Follow-up tools need productId and locationId, not SKU or location name.
Use response_format=json for the full location payload, including replenishmentReservations.

Args:
  - viewMode (product|location), search, page, pageSize (max 100)
  - sortBy, sortDirection, filter, inStockOnly, productType, clientId
  - locationId, productId, includeHidden, refresh, countOnly
  - response_format

Returns: items plus total_count, page, has_more, next_page, and restocking settings. countOnly returns total_count only.

Use when: "what is on hand for SKU X" (search=SKU, viewMode=product), "what is the safety stock", or "where is this stored" (viewMode=location).
Do not use when: you need the batch/serial ledger (use starshipit_wms_get_inventory).`,
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
        clientId: params.clientId,
        refresh: params.refresh,
        locationId: params.locationId,
        productId: params.productId,
        includeHidden: params.includeHidden,
        countOnly: params.countOnly
      }));
      const listed = wrapList(
        data,
        "items",
        pickItems(data, ["items"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Inventory",
        params.page,
        inventoryEnvelope(data)
      );
      return {
        ...listed,
        markdown: formatInventoryList(listed.output)
      };
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_inventory",
    title: "Get Product Inventory Detail",
    description: `Get detailed inventory for one product ID, including location breakdowns.

Default records include quantityMovable and availableQuantity (on-hand minus active movement reservations, floored at zero). Sales demand does not reduce that figure. canonical=true returns the per-location summary. forMovement=true returns the live movement ledger with movementReservations; canonical takes precedence. The live ledger has no quantityMovable.

safetyStock is on starshipit_wms_list_inventory product rows, not this ledger.

Args:
  - productId (required WMS product ID)
  - canonical (optional)
  - forMovement (optional)
  - response_format

Use quantityAvailable before allocating or moving stock. Use quantityMovable before a physical move.
Use when: you have a productId from starshipit_wms_get_product_by_sku or list_inventory.
Do not use when: you only have a SKU — look up the product first.`,
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/inventory/${encodeURIComponent(params.productId)}`, omitUndefined({
        canonical: params.canonical,
        forMovement: params.forMovement
      }));
      const detail = wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Product Inventory");
      return {
        ...detail,
        markdown: formatInventoryDetail(data)
      };
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

const INVENTORY_PAGINATION_KEYS = new Set([
  "items",
  "page",
  "pageSize",
  "limit",
  "totalCount",
  "totalPages",
  "pagination",
  "hasNext"
]);

function inventoryEnvelope(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!INVENTORY_PAGINATION_KEYS.has(key)) {
      extra[key] = value;
    }
  }
  return extra;
}

const PRODUCT_FIELDS = [
  "quantityOnHand",
  "quantityIncoming",
  "quantityReserved",
  "quantityCommitted",
  "quantityUnavailable",
  "quantityAvailable",
  "preOrder",
  "leadTimeDays",
  "unitCost",
  "inventoryValue",
  "barcode",
  "productType",
  "trackingType",
  "allocationRule",
  "uomLabel",
  "conversionQuantity"
] as const;

const LOCATION_FIELDS = [
  "locationType",
  "quantityOnHand",
  "quantityMovable",
  "quantityAvailable",
  "quantityAllocated",
  "quantityPicked"
] as const;

const DETAIL_FIELDS = [
  "id",
  "locationId",
  "locationType",
  "quantityOnHand",
  "quantityMovable",
  "availableQuantity",
  "allocatedQuantity",
  "batchNumber",
  "serialNumber",
  "expiryDate",
  "containerId"
] as const;

const COMMERCE_LINKS: Array<[string, string]> = [
  ["hasShopifyCommerceInventoryLink", "Shopify"],
  ["hasWooCommerceCommerceLink", "WooCommerce"],
  ["hasBigCommerceCommerceLink", "BigCommerce"],
  ["hasMagento2CommerceLink", "Magento2"],
  ["hasCin7CommerceLink", "Cin7"],
  ["hasMyobAcumaticaCommerceLink", "MYOB Acumatica"],
  ["hasEtsyCommerceLink", "Etsy"],
  ["hasEbayCommerceLink", "eBay"],
  ["hasNetSuiteCommerceLink", "NetSuite"]
];

function formatInventoryList(output: ToolOutput): string {
  const lines = ["# Inventory", ""];
  for (const [key, value] of Object.entries(output)) {
    if (key === "items" || value == null || typeof value === "object") {
      continue;
    }
    lines.push(`- **${key}**: ${String(value)}`);
  }

  const items = Array.isArray(output.items) ? output.items : [];
  if (items.length === 0) {
    lines.push("", "_No items_");
    return lines.join("\n").trim();
  }

  lines.push("");
  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    if (Array.isArray(record.products)) {
      lines.push(formatLocationGroup(record));
    } else {
      lines.push(formatProductRow(record));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatInventoryDetail(data: unknown): string {
  const lines = ["# Product Inventory", ""];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    lines.push(data == null ? "null" : String(data));
    return lines.join("\n").trim();
  }

  const record = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (value == null || typeof value === "object") {
      continue;
    }
    lines.push(`- **${key}**: ${String(value)}`);
  }

  const records = Array.isArray(record.inventoryRecords) ? record.inventoryRecords : [];
  for (const row of records) {
    const entry = asRecord(row);
    if (!entry) {
      continue;
    }
    const title = scalar(entry.locationName) ?? scalar(entry.id) ?? "Record";
    lines.push("", `## ${title}`);
    for (const key of DETAIL_FIELDS) {
      const rendered = renderField(key, entry[key]);
      if (rendered) {
        lines.push(rendered);
      }
    }
    appendReservationCounts(lines, entry);
  }

  if (records.length === 0) {
    lines.push("", "_No inventory records_");
  }
  return lines.join("\n").trim();
}

function formatProductRow(record: Record<string, unknown>): string {
  const lines = [`## ${productHeading(record)}`];
  const safetyStock = safetyStockLine(record);
  if (safetyStock) {
    lines.push(safetyStock);
  }
  for (const key of PRODUCT_FIELDS) {
    const rendered = renderField(key, record[key]);
    if (rendered) {
      lines.push(rendered);
    }
  }
  appendUomConversions(lines, record.uomConversions);
  appendCommerceLinks(lines, record);
  appendAllocationSummary(lines, record.allocationSummary);

  const locations = locationRows(record);
  if (locations.length > 0) {
    lines.push("- **locations**:");
    for (const location of locations) {
      lines.push(formatLocationLine(location));
    }
  }
  return lines.join("\n");
}

function formatLocationGroup(record: Record<string, unknown>): string {
  const name = scalar(record.name) ?? scalar(record.id) ?? "Location";
  const id = scalar(record.id);
  const lines = [`## ${id && id !== name ? `${name} (${id})` : name}`];
  for (const key of ["type", "totalQuantity", "productCount"] as const) {
    const rendered = renderField(key, record[key]);
    if (rendered) {
      lines.push(rendered);
    }
  }
  const products = Array.isArray(record.products) ? record.products : [];
  for (const product of products) {
    const entry = asRecord(product);
    if (!entry) {
      continue;
    }
    lines.push("", `### ${productHeading(entry)}`);
    const safetyStock = safetyStockLine(entry);
    if (safetyStock) {
      lines.push(safetyStock);
    }
    for (const key of PRODUCT_FIELDS) {
      const rendered = renderField(key, entry[key]);
      if (rendered) {
        lines.push(rendered);
      }
    }
  }
  return lines.join("\n");
}

function formatLocationLine(record: Record<string, unknown>): string {
  const name = scalar(record.locationName) ?? scalar(record.name) ?? "location";
  const id = scalar(record.locationId) ?? scalar(record.id);
  const parts: string[] = [];
  for (const key of LOCATION_FIELDS) {
    const value = record[key];
    if (value == null || value === "" || typeof value === "object") {
      continue;
    }
    parts.push(`${key} ${String(value)}`);
  }
  const reservations = Array.isArray(record.replenishmentReservations)
    ? record.replenishmentReservations.length
    : 0;
  if (reservations > 0) {
    parts.push(`replenishmentReservations ${reservations}`);
  }
  const label = id ? `${name} (${id})` : name;
  return `  - ${label}: ${parts.join(", ")}`;
}

function productHeading(record: Record<string, unknown>): string {
  const sku = scalar(record.sku);
  const name = scalar(record.name);
  const id = scalar(record.id);
  const title = [sku, name].filter((part): part is string => part !== undefined).join(" — ");
  if (title && id) {
    return `${title} (${id})`;
  }
  return title || id || "Item";
}

function safetyStockLine(record: Record<string, unknown>): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, "safetyStock")) {
    return undefined;
  }
  const value = record.safetyStock;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `- **safetyStock**: ${value}`;
  }
  return "- **safetyStock**: unset";
}

function renderField(key: string, value: unknown): string | undefined {
  if (value == null || value === "" || typeof value === "object") {
    return undefined;
  }
  return `- **${key}**: ${String(value)}`;
}

function appendUomConversions(lines: string[], value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }
  const labels = value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) {
      return [];
    }
    const label = scalar(record.uomLabel);
    const quantity = record.conversionQuantity;
    if (!label || typeof quantity !== "number") {
      return [];
    }
    return [`${label} x${quantity}`];
  });
  if (labels.length > 0) {
    lines.push(`- **uomConversions**: ${labels.join(", ")}`);
  }
}

function appendCommerceLinks(lines: string[], record: Record<string, unknown>): void {
  const linked = COMMERCE_LINKS.filter(([key]) => record[key] === true).map(([, label]) => label);
  if (linked.length > 0) {
    lines.push(`- **commerceLinks**: ${linked.join(", ")}`);
  }
}

function appendAllocationSummary(lines: string[], value: unknown): void {
  const summary = asRecord(value);
  if (!summary) {
    return;
  }
  const parts: string[] = [];
  let active = false;
  for (const key of ["quantityAllocatedOnly", "quantityPicked", "quantityAllocated", "allocationCount"] as const) {
    const entry = summary[key];
    if (typeof entry !== "number") {
      continue;
    }
    if (entry !== 0) {
      active = true;
    }
    parts.push(`${key} ${entry}`);
  }
  if (active) {
    lines.push(`- **allocationSummary**: ${parts.join(", ")}`);
  }
}

function appendReservationCounts(lines: string[], record: Record<string, unknown>): void {
  for (const key of ["replenishmentReservations", "movementReservations"] as const) {
    const reservations = record[key];
    if (Array.isArray(reservations) && reservations.length > 0) {
      lines.push(`- **${key}**: ${reservations.length}`);
    }
  }
}

function locationRows(record: Record<string, unknown>): Record<string, unknown>[] {
  const source = Array.isArray(record.inventories) && record.inventories.length > 0
    ? record.inventories
    : record.detailedInventories;
  if (!Array.isArray(source)) {
    return [];
  }
  return source.flatMap((entry) => {
    const row = asRecord(entry);
    return row ? [row] : [];
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}
