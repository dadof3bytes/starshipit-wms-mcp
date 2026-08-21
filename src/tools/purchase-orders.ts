import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wmsGet, wmsPost, wmsPut } from "../services/wms-client.js";
import { PerformedBySchema } from "../schemas/bodies.js";
import { IdSchema, omitUndefined, withResponseFormat } from "../schemas/common.js";
import { ResponseFormat } from "../types.js";
import { pickItems, registerDefinedTool, wrapList, wrapRecord } from "./helpers.js";

const ListSchema = withResponseFormat({
  status: z.string().optional().describe("DRAFT, CREATED, PARTIALLY_RECEIVED, RECEIVED, or receivable"),
  search: z.string().optional().describe("Search PO number or supplier name"),
  limit: z.number().int().positive().optional().describe("Maximum POs to return. No page metadata.")
});

const GetSchema = withResponseFormat({
  id: IdSchema.describe("Purchase-order ID, not the poNumber")
});

const CreateLineSchema = z.object({
  productId: z.string().optional().describe("Existing product ID. Do not combine with sku or barcode."),
  sku: z.string().optional().describe("Exact SKU. Do not combine with productId or barcode."),
  barcode: z.string().optional().describe("Exact barcode. Do not combine with productId or sku."),
  quantity: z.number().int().positive().optional().describe("Positive quantity ordered"),
  price: z.number().min(0).optional().describe("Non-negative unit price")
}).strict();

const CreateSchema = withResponseFormat({
  poNumber: z.string().min(1).describe("Unique purchase-order number for the account"),
  supplierId: z.string().optional().describe("Existing supplier ID. Do not combine with supplierName."),
  supplierName: z.string().optional().describe("Exact supplier name to reuse or create. Do not combine with supplierId."),
  status: z.string().min(1).describe("Initial status, e.g. CREATED"),
  expectedArrivalDate: z.string().nullable().optional().describe("YYYY-MM-DD or null"),
  lineItems: z.array(CreateLineSchema).optional()
});

const UpdateLineSchema = z.object({
  id: z.string().optional().describe("Existing line ID. Omit or use NEW to create a line."),
  productId: z.string().optional(),
  quantity: z.number().optional(),
  price: z.number().optional()
}).strict();

const UpdateSchema = withResponseFormat({
  id: IdSchema.describe("Purchase-order ID"),
  supplierId: z.string().optional(),
  status: z.string().optional(),
  expectedArrivalDate: z.string().nullable().optional().describe("YYYY-MM-DD, null, or omitted"),
  cartonsReceived: z.number().optional(),
  lineItems: z.array(UpdateLineSchema).optional().describe("Complete replacement list. Omitted existing lines are removed.")
});

const ReceivingItemSchema = z.object({
  id: z.string().optional().describe("Optional client-side receiving-row ID"),
  lineItemId: z.string().min(1).describe("Purchase-order line ID"),
  productId: z.string().min(1).describe("Product ID"),
  quantityReceiving: z.number().describe("Quantity to receive for this line"),
  targetLocationId: z.string().min(1).describe("Destination WMS location ID"),
  containerId: z.string().nullable().optional(),
  batchNumber: z.string().optional(),
  serialNumbers: z.array(z.string()).optional(),
  expiryDate: z.string().optional(),
  costPrice: z.number().optional(),
  markedMissing: z.boolean().optional()
}).strict();

const ReceiveSchema = withResponseFormat({
  purchaseOrderId: IdSchema.describe("Purchase-order ID"),
  receivingItems: z.array(ReceivingItemSchema).min(1),
  cartonsReceived: z.number().optional(),
  markPOComplete: z.boolean().optional(),
  performedBy: PerformedBySchema
});

const DraftSchema = withResponseFormat({
  analysisWindowDays: z.number().int().positive().optional(),
  leadTimeDays: z.number().int().min(0).optional()
});

const ActorSchema = withResponseFormat({
  id: IdSchema.describe("Purchase-order ID"),
  performedBy: PerformedBySchema
});

export function registerPurchaseOrderTools(server: McpServer): void {
  registerDefinedTool(server, {
    name: "starshipit_wms_list_purchase_orders",
    title: "List Purchase Orders",
    description: `List purchase orders. status=receivable returns CREATED or PARTIALLY_RECEIVED POs with remaining qty.

This list has limit but no page metadata. Narrow with status or search.
Store the top-level id (purchaseOrderId), not poNumber.`,
    inputSchema: ListSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>("/api/purchase-order", omitUndefined({
        status: params.status,
        search: params.search,
        limit: params.limit
      }));
      return wrapList(
        data,
        "purchase_orders",
        pickItems(data, ["purchaseOrders", "items", "data"]),
        params.response_format ?? ResponseFormat.MARKDOWN,
        "Purchase Orders"
      );
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_get_purchase_order",
    title: "Get Purchase Order",
    description: "Get one PO by ID. Re-read before receive or mark-received. Compare quantityReceived before retrying a receive.",
    inputSchema: GetSchema,
    readOnly: true,
    handler: async (params) => {
      const data = await wmsGet<unknown>(`/api/purchase-order/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Purchase Order");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_purchase_order",
    title: "Create Purchase Order",
    description: `Create a PO. Provide exactly one of supplierId or supplierName. Each line needs exactly one of productId, sku, or barcode.

poNumber must be unique. If create times out, search by poNumber before retrying — WMS rejects duplicates.
Receiving changes inventory. Do not receive with this tool.`,
    inputSchema: CreateSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/purchase-order", omitUndefined({
        poNumber: params.poNumber,
        supplierId: params.supplierId,
        supplierName: params.supplierName,
        status: params.status,
        expectedArrivalDate: params.expectedArrivalDate,
        lineItems: params.lineItems
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Created Purchase Order");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_duplicate_purchase_order",
    title: "Duplicate Purchase Order",
    description: "Duplicate an existing purchase order by ID.",
    inputSchema: GetSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/purchase-order/${encodeURIComponent(params.id)}`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Duplicated Purchase Order");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_email_purchase_order",
    title: "Email Purchase Order",
    description: "Email a purchase order to its supplier.",
    inputSchema: GetSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(`/api/purchase-order/${encodeURIComponent(params.id)}/email`);
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Emailed Purchase Order");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_update_purchase_order",
    title: "Update Purchase Order",
    description: "Update a PO. lineItems is a complete replacement list if supplied.",
    inputSchema: UpdateSchema,
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (params) => {
      const data = await wmsPut<unknown>(`/api/purchase-order/${encodeURIComponent(params.id)}`, omitUndefined({
        supplierId: params.supplierId,
        status: params.status,
        expectedArrivalDate: params.expectedArrivalDate,
        cartonsReceived: params.cartonsReceived,
        lineItems: params.lineItems
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Updated Purchase Order");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_create_draft_purchase_orders_from_restocking",
    title: "Create Draft POs From Restocking",
    description: "Generate draft purchase orders from restocking forecast. Optional analysisWindowDays and leadTimeDays.",
    inputSchema: DraftSchema,
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/restocking-forecast/draft-purchase-orders", omitUndefined({
        analysisWindowDays: params.analysisWindowDays,
        leadTimeDays: params.leadTimeDays
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Draft Purchase Orders");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_receive_purchase_order",
    title: "Receive Purchase Order",
    description: `Receive PO lines into a targetLocationId. This changes inventory and can create putaway work.

Re-read the PO first. quantityReceiving is this transaction only.
Batch-tracked lines need batchNumber. Serial-tracked lines need one serial per unit.
HTTP 200 with success=false is still a failure — do not retry until corrected.
If a receive times out, re-read quantityReceived before sending the same quantity again.`,
    inputSchema: ReceiveSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>("/api/purchase-order/receive", omitUndefined({
        purchaseOrderId: params.purchaseOrderId,
        receivingItems: params.receivingItems,
        cartonsReceived: params.cartonsReceived,
        markPOComplete: params.markPOComplete,
        performedBy: params.performedBy
      }));
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Receive Purchase Order");
    }
  });

  registerDefinedTool(server, {
    name: "starshipit_wms_mark_purchase_order_received",
    title: "Mark Purchase Order Received",
    description: "Mark a PO received. Re-read first. Optional performedBy for audit.",
    inputSchema: ActorSchema,
    readOnly: false,
    destructive: true,
    idempotent: false,
    handler: async (params) => {
      const data = await wmsPost<unknown>(
        `/api/purchase-order/${encodeURIComponent(params.id)}/mark-received`,
        omitUndefined({ performedBy: params.performedBy })
      );
      return wrapRecord(data, params.response_format ?? ResponseFormat.MARKDOWN, "Marked Received");
    }
  });
}
