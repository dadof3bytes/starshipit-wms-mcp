import { z } from "zod";
import { PerformedBySchema } from "./common.js";

export const CommerceWritebackSchema = z
  .object({
    shopify: z.boolean().optional().describe("true disables Shopify inventory writeback."),
    woocommerce: z.boolean().optional().describe("true disables WooCommerce inventory writeback."),
    bigcommerce: z.boolean().optional().describe("true disables BigCommerce inventory writeback."),
    magento2: z.boolean().optional().describe("true disables Magento 2 inventory writeback."),
    cin7: z.boolean().optional().describe("true disables Cin7 inventory writeback."),
    unleashed: z.boolean().optional().describe("true disables Unleashed inventory writeback."),
    ebay: z.boolean().optional().describe("true disables eBay inventory writeback.")
  })
  .strict()
  .optional()
  .describe("Per-provider switches that disable inventory writeback for this product. true disables writeback for every store of that provider.");

export const CommerceWritebackByLinkIdSchema = z
  .record(z.string().min(1), z.boolean())
  .optional()
  .describe("Map of productCommerceLinks.id to a boolean. true disables inventory writeback for that one commerce connection. false enables it. Other links for the same provider stay unchanged.");

export const SafetyStockSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .optional()
  .describe("Shopify safety-stock buffer in whole selling units. Integer from 0 to 2147483647. 0 releases the buffer. Omit on update to keep the current value. Null is rejected.");

export const ProductFieldsSchema = {
  sku: z.string().min(1).optional().describe("Product SKU"),
  name: z.string().min(1).optional().describe("Product name"),
  clientId: z.string().nullable().optional().describe("Client ID, or null to clear client ownership"),
  supplierId: z.string().nullable().optional().describe("Supplier ID, or null to clear the supplier"),
  image: z.string().nullable().optional().describe("Product image URL, or null to clear it"),
  price: z.number().min(0).optional().describe("Non-negative selling price"),
  unitCost: z.number().min(0).optional().describe("Non-negative unit cost"),
  trackingType: z.string().optional().describe("Inventory tracking mode, e.g. NONE, BATCH, SERIAL"),
  allocationRule: z.string().optional().describe("Inventory allocation order, e.g. FIFO, LIFO"),
  parentProductId: z.string().nullable().optional().describe("Parent product ID for a child UoM SKU, or null to unlink"),
  conversionQuantity: z.number().int().positive().optional().describe("Positive conversion quantity relative to the parent"),
  uomLabel: z.string().min(1).optional().describe("Unit-of-measure label"),
  productType: z.string().optional().describe("Product kind, e.g. STANDARD, BUNDLE"),
  bundleExplosionMode: z.string().nullable().optional().describe("Bundle handling mode, or null to clear it"),
  leadTimeDays: z.number().int().min(0).nullable().optional().describe("Non-negative supplier lead time in days, or null to use the account default"),
  stockWarningLevel: z.number().int().min(0).nullable().optional().describe("Non-negative low-stock warning threshold, or null"),
  idealStockLevel: z.number().int().min(0).nullable().optional().describe("Non-negative target stock level, or null"),
  visible: z.boolean().optional().describe("Whether the product is visible"),
  barcode: z.string().nullable().optional().describe("Barcode, or null to clear it"),
  length: z.number().min(0).nullable().optional().describe("Non-negative product length, or null"),
  width: z.number().min(0).nullable().optional().describe("Non-negative product width, or null"),
  height: z.number().min(0).nullable().optional().describe("Non-negative product height, or null"),
  weight: z.number().min(0).nullable().optional().describe("Non-negative product weight, or null"),
  colour: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  materials: z.string().nullable().optional(),
  countryOfOrigin: z.string().nullable().optional(),
  manufacturerId: z.string().nullable().optional(),
  brandName: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  usage: z.string().nullable().optional(),
  dangerousGoods: z.boolean().optional(),
  description: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  safetyStock: SafetyStockSchema
};

export { PerformedBySchema };
