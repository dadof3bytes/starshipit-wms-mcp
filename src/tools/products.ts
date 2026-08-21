import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsDelete, wmsGet, wmsPatch, wmsPost, wmsPut } from "../services/wms-client.js";
import { CommerceWritebackSchema, PerformedBySchema, ProductFieldsSchema } from "../schemas/bodies.js";
import { IdSchema, PageSchema, omitToolMeta, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  page: PageSchema,
  limit: z.number().int().min(1).max(500).default(50).describe("Page size, default 50, maximum 500"),
  search: z.string().optional().describe("Search SKU, name, and related product data"),
  productType: z.string().optional(),
  trackingType: z.string().optional(),
  allocationRule: z.string().optional(),
  bundleExplosionMode: z.string().optional(),
  sortBy: z.string().optional(),
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
  performedBy: PerformedBySchema
});

const BulkUpdateSchema = withResponseFormat({
  productIds: z.array(z.string().min(1)).min(1).describe("Non-empty list of product IDs"),
  countryOfOrigin: z.string().min(1).optional(),
  visible: z.boolean().optional(),
  allocationRule: z.string().optional(),
  commerceWritebackDisabledByProvider: CommerceWritebackSchema,
  clientId: z.string().nullable().optional()
});

const DeleteSchema = withResponseFormat({
  id: IdSchema.describe("WMS product ID to delete")
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

Use when: browsing the catalogue or finding a product before inventory lookup.
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
      return wrapList(
        data,
        "products",
        pickItems(data, ["products", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Products",
        params.page
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_product",
    title: "Get WMS Product",
    description: "Get one product by WMS product ID. Use starshipit_wms_get_product_by_sku when you only have a SKU.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/product/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Product");
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
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, `Product ${params.sku}`);
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

Match by SKU before retrying a timed-out create to avoid duplicates.
This writes catalogue data.`,
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const body = omitUndefined(omitToolMeta(params));
      const data = await wmsPost<unknown>("/api/product", body);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Created Product");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_update_product",
    title: "Update WMS Product",
    description: "Update one product by ID. clientId and supplierId may be null to clear assignment. Re-read before retrying.",
    inputSchema: UpdateSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const { id, ...rest } = omitToolMeta(params);
      const data = await wmsPut<unknown>(`/api/product/${encodeURIComponent(id)}`, omitUndefined(rest));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Updated Product");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_bulk_update_products",
    title: "Bulk Update WMS Products",
    description: "Update many products. Provide productIds plus at least one mutable field. clientId may be null to clear ownership.",
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
}
