import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsDelete, wmsGet, wmsPatch, wmsPost, wmsPut } from "../services/wms-client.js";
import { CommerceWritebackByLinkIdSchema, CommerceWritebackSchema, PerformedBySchema, ProductFieldsSchema, SafetyStockSchema } from "../schemas/bodies.js";
import { IdSchema, PageSchema, omitToolMeta, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat, WmsApiError, type ToolOutput } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  page: PageSchema,
  limit: z.number().int().min(1).max(500).default(50).describe("Page size, default 50, maximum 500"),
  search: z.string().optional().describe("Search SKU, name, and related product data"),
  productType: z.string().optional(),
  trackingType: z.string().optional(),
  allocationRule: z.string().optional(),
  bundleExplosionMode: z.string().optional(),
  sortBy: z.string().optional().describe("Sort field. safetyStock is supported on full product records."),
  sortDirection: z.string().optional(),
  clientId: z.string().optional(),
  sourceShopifyStore: z.string().optional().describe("Filter by Shopify CommerceLink source store key"),
  sourceStarshipitAccountId: z.number().int().positive().optional(),
  complianceFilter: z.string().optional().describe("Filter by landed-cost compliance gaps")
});

const GetSchema = withResponseFormat({
  id: IdSchema.describe("WMS product ID")
});

const GetBySkuSchema = withResponseFormat({
  sku: z.string().min(1).describe("Exact product SKU"),
  clientId: z.string().optional().describe("Optional client scope")
});

const SourceStoresSchema = withResponseFormat({
  clientId: z.string().optional()
});

const CreateSchema = withResponseFormat({
  ...ProductFieldsSchema,
  sku: z.string().min(1).describe("Non-empty product SKU"),
  name: z.string().min(1).describe("Non-empty product name"),
  price: z.number().min(0).describe("Non-negative selling price")
});

const UpdateSchema = withResponseFormat({
  id: IdSchema.describe("WMS product ID to update"),
  ...ProductFieldsSchema,
  commerceWritebackDisabledByProvider: CommerceWritebackSchema,
  commerceWritebackDisabledByLinkId: CommerceWritebackByLinkIdSchema,
  preOrder: z.boolean().optional().describe("Whether the product is marked for pre-order. Omit to keep the current value. Null is rejected."),
  performedBy: PerformedBySchema
});

const BulkUpdateSchema = withResponseFormat({
  productIds: z.array(z.string().min(1)).min(1).describe("Non-empty list of product IDs"),
  countryOfOrigin: z.string().min(1).optional(),
  visible: z.boolean().optional(),
  allocationRule: z.string().optional(),
  commerceWritebackDisabledByProvider: CommerceWritebackSchema,
  safetyStock: SafetyStockSchema,
  clientId: z.string().nullable().optional()
});

const DeleteSchema = withResponseFormat({
  id: IdSchema.describe("WMS product ID to delete")
});

const PushShopifyInventorySchema = withResponseFormat({
  productId: z.string().min(1).optional().describe("WMS product ID. Send sku as well when you already know it."),
  sku: z.string().min(1).optional().describe("Exact product SKU."),
  barcode: z.string().min(1).optional().describe("Exact product barcode."),
  name: z.string().min(1).optional().describe("Product title. A single search match is used. Several matches are returned and nothing is queued.")
});

const SyncSchema = withResponseFormat({});

const SyncShopifySchema = withResponseFormat({
  enabledFields: z.array(z.string()).optional().describe("Fields to update. Omit for all supported fields."),
  skuFilters: z.array(z.string()).optional(),
  pageNumber: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(20).optional(),
  filterActiveProducts: z.boolean().optional(),
  filterPublishedProducts: z.boolean().optional(),
  includeVariantTitleInName: z.boolean().optional(),
  store: z.string().optional(),
  sourceAccountId: z.number().int().positive().optional(),
  sourceShopifyStore: z.string().optional(),
  remainingNightlySourceStores: z.array(z.object({
    sourceAccountId: z.number().int().positive(),
    sourceShopifyStore: z.string().min(1)
  }).strict()).optional()
});

export function registerProductTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_products",
    title: "List WMS Products",
    description: `List paginated WMS products. Use search for SKU or name. Store the returned id for later tools.

The unpaginated product API is no longer supported — always send page and limit.

Full records include safetyStock (whole-unit Shopify buffer, or null when unset) and productCommerceLinks. Each link includes id and writebackDisabled. Use that id with commerceWritebackDisabledByLinkId on update. sortBy accepts safetyStock.

Use when: browsing the catalogue, checking a store's writeback flag, or finding a product before inventory lookup.
Do not use when: you only need stock levels (use starshipit_wms_list_inventory).`,
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/product", omitUndefined({
        page: params.page,
        limit: params.limit,
        search: params.search,
        productType: params.productType,
        trackingType: params.trackingType,
        allocationRule: params.allocationRule,
        bundleExplosionMode: params.bundleExplosionMode,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
        clientId: params.clientId,
        sourceShopifyStore: params.sourceShopifyStore,
        sourceStarshipitAccountId: params.sourceStarshipitAccountId,
        complianceFilter: params.complianceFilter
      }));
      const listed = wrapList(
        data,
        "products",
        pickItems(data, ["products", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Products",
        params.page
      );
      return {
        ...listed,
        markdown: formatProductList(listed.output)
      };
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_product",
    title: "Get WMS Product",
    description: `Get one product by WMS product ID.

The product includes safetyStock and productCommerceLinks. Each link has an id and writebackDisabled for that commerce connection. Pass the link id to commerceWritebackDisabledByLinkId when updating one store. Use starshipit_wms_get_product_by_sku when you only have a SKU.`,
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/product/${encodeURIComponent(params.id)}`);
      return productRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Product");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_product_by_sku",
    title: "Get WMS Product By SKU",
    description: `Look up a product by exact SKU and store the returned id.

That id is required for inventory, movements, purchase-order lines, and picking.
Some accounts require clientId. If you get 400 asking for clientId, supply it and retry.`,
    inputSchema: GetBySkuSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(
        `/api/product/sku/${encodeURIComponent(params.sku)}`,
        omitUndefined({ clientId: params.clientId })
      );
      return productRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, `Product ${params.sku}`);
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_list_product_source_stores",
    title: "List Product Source Stores",
    description: "List Shopify/Starshipit source stores linked to WMS products. Optional clientId filter.",
    inputSchema: SourceStoresSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/product/source-stores", omitUndefined({ clientId: params.clientId }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Product Source Stores");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_product",
    title: "Create WMS Product",
    description: `Create a WMS product. sku, name, and price are required.

Optional safetyStock sets the Shopify buffer in whole selling units. 0 releases the buffer.

Match by SKU before retrying a timed-out create to avoid duplicates.
This writes catalogue data.`,
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const body = omitUndefined(omitToolMeta(params));
      const data = await wmsPost<unknown>("/api/product", body);
      return productRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Created Product");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_update_product",
    title: "Update WMS Product",
    description: `Update one product by ID. Send at least one mutable field. clientId and supplierId may be null to clear assignment.

safetyStock sets the Shopify buffer in whole selling units, from 0 to 2147483647. 0 releases the buffer. Omit it to keep the current value. Null is rejected.

commerceWritebackDisabledByProvider disables inventory writeback for every store of one provider. Set shopify, woocommerce, bigcommerce, magento2, cin7, unleashed, or ebay to true or false.

commerceWritebackDisabledByLinkId changes one commerce connection. The key is productCommerceLinks.id from the product read, and the value is a boolean. true disables writeback for that link only.

Example: {"commerceWritebackDisabledByLinkId":{"<productCommerceLinks.id>":true}}

preOrder takes a boolean. Omit it to keep the current value.

Re-read before retrying.`,
    inputSchema: UpdateSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const { id, ...rest } = omitToolMeta(params);
      const data = await wmsPut<unknown>(`/api/product/${encodeURIComponent(id)}`, omitUndefined(rest));
      return productRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Updated Product");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_bulk_update_products",
    title: "Bulk Update WMS Products",
    description: "Update many products. Provide productIds plus at least one mutable field. safetyStock sets the Shopify buffer on each selected product. clientId may be null to clear ownership.",
    inputSchema: BulkUpdateSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPatch<unknown>("/api/product", omitUndefined(omitToolMeta(params)));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Bulk Product Update");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_delete_product",
    title: "Delete WMS Product",
    description: "Permanently delete a product by WMS product ID. Confirm the ID first. Destructive.",
    inputSchema: DeleteSchema,
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsDelete<unknown>(`/api/product/${encodeURIComponent(params.id)}`);
      return wrapRecord(data ?? { deleted: true, id: params.id }, params.response_format ?? ResponseFormat.MARKDOWN, "Deleted Product");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_sync_products",
    title: "Sync Products From Starshipit",
    description: "Trigger a product sync from the core Starshipit account into WMS. This is a write.",
    inputSchema: SyncSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/product/sync");
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Product Sync");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_sync_products_shopify",
    title: "Sync Products From Shopify",
    description: "Import or update WMS products from Shopify. Provide both sourceAccountId and sourceShopifyStore when targeting a store. pageSize max 20.",
    inputSchema: SyncShopifySchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/product/sync-shopify", omitUndefined(omitToolMeta(params)));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Shopify Product Sync");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_push_shopify_inventory",
    title: "Push Shopify Inventory Writeback",
    description: `Queue a Shopify inventory writeback for one WMS product. This sends the current WMS quantity to Shopify.

Identify the product with productId, sku, barcode, or name (title). Provide one identifier. When several products match, nothing is queued and the matches are returned. Use the returned productId to retry.

This does not import the catalogue from Shopify. Use starshipit_wms_sync_products_shopify for that.

Check productCommerceLinks.writebackDisabled to see which Shopify stores are set to receive writeback. queuedCount is the number of writebacks WMS queued.

Returns queuedCount and the submitted product, including quantity when WMS sends it.`,
    inputSchema: PushShopifyInventorySchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const target = await resolveShopifyPushTarget(params);
      if ("matches" in target) {
        return wrapRecord({
          queued: false,
          reason: "Several products matched. Call again with one productId or sku.",
          matches: target.matches
        }, params.response_format ?? ResponseFormat.MARKDOWN, "Shopify Inventory Writeback");
      }

      const data = await wmsPost<unknown>("/api/shopify/inventory-sync", {
        items: [{ productId: target.product.id, sku: target.product.sku }]
      });
      const result = asRecord(data) ?? { result: data };
      return wrapRecord({
        queued: true,
        productId: target.product.id,
        sku: target.product.sku,
        name: target.product.name ?? null,
        ...result
      }, params.response_format ?? ResponseFormat.MARKDOWN, "Shopify Inventory Writeback");
    }
  });
}

const LIST_FIELDS = [
  "price",
  "productType",
  "visible",
  "preOrder",
  "clientId"
] as const;

interface ResolvedProduct {
  id: string;
  sku: string;
  name?: string;
  barcode?: string;
}

async function resolveShopifyPushTarget(params: {
  productId?: string;
  sku?: string;
  barcode?: string;
  name?: string;
}): Promise<{ product: ResolvedProduct } | { matches: ResolvedProduct[] }> {
  if (!params.productId && !params.sku && !params.barcode && !params.name) {
    throw new WmsApiError("Provide a productId, sku, barcode, or name.", {
      suggestion: "Use the product title, SKU, barcode, or the WMS product ID from a product search."
    });
  }

  if (params.productId) {
    if (params.sku) {
      return { product: { id: params.productId, sku: params.sku, name: params.name } };
    }
    const product = await readProductById(params.productId);
    if (!product) {
      throw new WmsApiError(`Product ${params.productId} has no SKU to send with the Shopify writeback.`, {
        suggestion: "Pass sku together with productId."
      });
    }
    return { product };
  }

  if (params.sku) {
    const data = await wmsGet<unknown>(`/api/product/sku/${encodeURIComponent(params.sku)}`);
    const product = productFromPayload(data);
    if (!product) {
      throw new WmsApiError(`No product found for SKU ${params.sku}.`, {
        suggestion: "Check the SKU, or search by name and retry with productId."
      });
    }
    return { product };
  }

  const query = params.barcode ?? params.name ?? "";
  const products = await searchProducts(query);
  const chosen = choosePushProduct(query, products, params.barcode ? "barcode" : "name");
  if (Array.isArray(chosen)) {
    if (chosen.length === 0) {
      throw new WmsApiError(`No product found for ${params.barcode ? "barcode" : "name"} ${query}.`, {
        suggestion: "Try the exact SKU or productId."
      });
    }
    return { matches: chosen };
  }
  return { product: chosen };
}

async function readProductById(productId: string): Promise<ResolvedProduct | undefined> {
  const data = await wmsGet<unknown>(`/api/product/${encodeURIComponent(productId)}`);
  return productFromPayload(data);
}

async function searchProducts(query: string): Promise<ResolvedProduct[]> {
  const data = await wmsGet<unknown>("/api/product", { search: query, page: 1, limit: 25 });
  const record = asRecord(data);
  const products = record && Array.isArray(record.products) ? record.products : [];
  return products.flatMap((item) => {
    const row = asRecord(item);
    const product = row ? productFromRecord(row) : undefined;
    return product ? [product] : [];
  });
}

function choosePushProduct(
  query: string,
  products: ResolvedProduct[],
  mode: "barcode" | "name"
): ResolvedProduct | ResolvedProduct[] {
  const needle = query.trim().toLowerCase();
  const exact = products.filter((product) => {
    if (mode === "barcode") {
      return product.barcode?.toLowerCase() === needle;
    }
    return product.name?.toLowerCase() === needle
      || product.sku.toLowerCase() === needle
      || product.barcode?.toLowerCase() === needle;
  });
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    return exact;
  }
  if (mode === "name" && products.length === 1) {
    return products[0];
  }
  if (mode === "name" && products.length > 1) {
    return products;
  }
  return [];
}

function productFromPayload(data: unknown): ResolvedProduct | undefined {
  const record = asRecord(data);
  if (!record) {
    return undefined;
  }
  const nested = asRecord(record.product);
  return productFromRecord(nested ?? record);
}

function productFromRecord(record: Record<string, unknown>): ResolvedProduct | undefined {
  const id = scalar(record.id);
  const sku = scalar(record.sku);
  if (!id || !sku) {
    return undefined;
  }
  const barcode = scalar(record.barcode);
  const name = scalar(record.name);
  return {
    id,
    sku,
    ...(name ? { name } : {}),
    ...(barcode ? { barcode } : {})
  };
}

function productRecord(
  data: unknown,
  responseFormat: ResponseFormat,
  title: string
): { output: ToolOutput; markdown: string; responseFormat: ResponseFormat } {
  const wrapped = wrapRecord(data, responseFormat, title);
  return {
    ...wrapped,
    markdown: formatProductDetail(data, title)
  };
}

function formatProductList(output: ToolOutput): string {
  const lines = ["# Products", ""];
  for (const [key, value] of Object.entries(output)) {
    if (key === "products" || value == null || typeof value === "object") {
      continue;
    }
    lines.push(`- **${key}**: ${String(value)}`);
  }

  const products = Array.isArray(output.products) ? output.products : [];
  if (products.length === 0) {
    lines.push("", "_No products_");
    return lines.join("\n").trim();
  }

  lines.push("");
  for (const product of products) {
    const record = asRecord(product);
    if (!record) {
      continue;
    }
    lines.push(`## ${productHeading(record)}`);
    const safetyStock = safetyStockLine(record);
    if (safetyStock) {
      lines.push(safetyStock);
    }
    for (const key of LIST_FIELDS) {
      const rendered = renderField(key, record[key]);
      if (rendered) {
        lines.push(rendered);
      }
    }
    lines.push(...formatCommerceLinks(record.productCommerceLinks));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatProductDetail(data: unknown, title: string): string {
  const lines = [`# ${title}`, ""];
  const record = asRecord(data);
  if (!record) {
    lines.push(data == null ? "null" : String(data));
    return lines.join("\n").trim();
  }

  const nested = asRecord(record.product);
  const product = nested ?? record;
  if (nested && record.success !== undefined) {
    lines.push(`- **success**: ${String(record.success)}`);
  }
  lines.push(formatProductBody(product));
  return lines.join("\n").trim();
}

function formatProductBody(record: Record<string, unknown>): string {
  const lines: string[] = [];
  const safetyStock = safetyStockLine(record);
  if (safetyStock) {
    lines.push(safetyStock);
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "safetyStock" || key === "productCommerceLinks") {
      continue;
    }
    if (value == null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`- **${key}**: ${value.length} item(s)`);
      continue;
    }
    if (typeof value === "object") {
      lines.push(`- **${key}**:`);
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (childValue == null || typeof childValue === "object") {
          continue;
        }
        lines.push(`  - ${childKey}: ${String(childValue)}`);
      }
      continue;
    }
    lines.push(`- **${key}**: ${String(value)}`);
  }
  lines.push(...formatCommerceLinks(record.productCommerceLinks));
  return lines.join("\n");
}

function formatCommerceLinks(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }
  const lines = ["- **productCommerceLinks**:"];
  for (const link of value) {
    const record = asRecord(link);
    if (!record) {
      continue;
    }
    const provider = scalar(record.provider) ?? "unknown";
    const store = scalar(record.sourceStoreKey) ?? scalar(record.sourceStoreName);
    const id = scalar(record.id);
    const label = store ? `${provider} / ${store}` : provider;
    const flag = Object.prototype.hasOwnProperty.call(record, "writebackDisabled")
      ? String(record.writebackDisabled)
      : "unknown";
    lines.push(`  - ${id ? `${label} (${id})` : label}: writebackDisabled ${flag}`);
  }
  return lines;
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

function productHeading(record: Record<string, unknown>): string {
  const sku = scalar(record.sku);
  const name = scalar(record.name);
  const id = scalar(record.id);
  const title = [sku, name].filter((part): part is string => part !== undefined).join(" — ");
  if (title && id) {
    return `${title} (${id})`;
  }
  return title || id || "Product";
}

function renderField(key: string, value: unknown): string | undefined {
  if (value == null || value === "" || typeof value === "object") {
    return undefined;
  }
  return `- **${key}**: ${String(value)}`;
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
