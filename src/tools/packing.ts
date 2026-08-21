import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost } from "../services/wms-client.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { registerDefinedTool, wrapRecord } from "./helpers.js";

const GetSchema = withResponseFormat({
  id: IdSchema.describe("Pack job ID")
});

const ProgressSchema = withResponseFormat({
  id: IdSchema.describe("Pack job ID"),
  orderId: z.string().min(1).describe("WMS order ID in the pack job"),
  packedQuantitiesByOrderItemId: z.record(z.string(), z.number().int().positive())
    .describe("Map of order-item IDs to positive packed quantities"),
  manuallyPackedOrderItemIds: z.array(z.string()).optional()
});

const PackagesSchema = withResponseFormat({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  packages: z.array(z.object({
    package_id: z.union([z.number().int().positive(), z.string()]).optional(),
    name: z.string().optional(),
    packaging_type: z.string().optional(),
    weight: z.number(),
    height: z.number(),
    width: z.number(),
    length: z.number(),
    quantity: z.number().int().positive().optional(),
    delete: z.boolean().optional()
  }).strict())
});

const ServiceSchema = withResponseFormat({
  jobId: z.string().optional().describe("Pack job ID. Required when the carrier changes."),
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  carrier: z.string().min(1),
  carrierName: z.string().optional(),
  serviceCode: z.string().min(1),
  serviceName: z.string().optional(),
  totalPrice: z.number().optional(),
  currency: z.string().optional(),
  metadatas: z.array(z.object({
    metafield_key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    required: z.boolean().optional()
  }).strict()).optional()
});

const PrintSchema = withResponseFormat({
  id: IdSchema.describe("Pack job ID"),
  orderNumber: z.string().min(1),
  orderId: z.string().min(1),
  items: z.array(z.object({
    sku: z.string().optional(),
    quantity_to_ship: z.union([z.number().int().positive(), z.string()]).optional(),
    quantityToShip: z.union([z.number().int().positive(), z.string()]).optional()
  }).strict()).optional(),
  download: z.boolean().optional(),
  isBatchPackJob: z.boolean().optional(),
  completedOrderIds: z.array(z.string()).optional(),
  totalOrdersInBatch: z.number().int().positive().optional()
});

export function registerPackingTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_get_pack_job",
    title: "Get Pack Job Details",
    description: "Get pack-job details by job ID.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/packing/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Pack Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_save_packing_progress",
    title: "Save Packing Progress",
    description: "Save packed quantities for an order in a pack job. Quantities must be positive whole numbers.",
    inputSchema: ProgressSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/packing/${encodeURIComponent(params.id)}/progress`, omitUndefined({
        orderId: params.orderId,
        packedQuantitiesByOrderItemId: params.packedQuantitiesByOrderItemId,
        manuallyPackedOrderItemIds: params.manuallyPackedOrderItemIds
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Packing Progress");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_update_order_packages",
    title: "Update Order Packages",
    description: "Set package configuration for an order. An empty packages array removes all packages. Each package needs numeric dimensions and weight.",
    inputSchema: PackagesSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/packing/packages", omitUndefined({
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        packages: params.packages
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Order Packages");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_update_carrier_service",
    title: "Update Carrier Service",
    description: "Set carrier and service for a WMS order. jobId is required when the carrier changes.",
    inputSchema: ServiceSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/packing/service", omitUndefined({
        jobId: params.jobId,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        carrier: params.carrier,
        carrierName: params.carrierName,
        serviceCode: params.serviceCode,
        serviceName: params.serviceName,
        totalPrice: params.totalPrice,
        currency: params.currency,
        metadatas: params.metadatas
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Carrier Service");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_begin_pack_job",
    title: "Begin Packing Job",
    description: "Begin a pack job. 409 ORDER_ON_HOLD means the order cannot be packed yet.",
    inputSchema: GetSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/packing/${encodeURIComponent(params.id)}/begin`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Begin Pack Job");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_print_shipping_label",
    title: "Print Shipping Label",
    description: "Print a shipping label for a packed order. This is a destructive fulfilment action. Omit items to ship the full order.",
    inputSchema: PrintSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/packing/${encodeURIComponent(params.id)}/print`, omitUndefined({
        orderNumber: params.orderNumber,
        orderId: params.orderId,
        items: params.items,
        download: params.download,
        isBatchPackJob: params.isBatchPackJob,
        completedOrderIds: params.completedOrderIds,
        totalOrdersInBatch: params.totalOrdersInBatch
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Print Label");
    }
  });
}
