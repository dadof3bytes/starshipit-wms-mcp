import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerWhoamiTool } from "./tools/whoami.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerProductTools } from "./tools/products.js";
import { registerLocationTools } from "./tools/locations.js";
import { registerPackageTools } from "./tools/packages.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerSupplierTools } from "./tools/suppliers.js";
import { registerPurchaseOrderTools } from "./tools/purchase-orders.js";
import { registerStockMovementTools } from "./tools/stock-movements.js";
import { registerAllocationTools } from "./tools/allocations.js";
import { registerPickingTools } from "./tools/picking.js";
import { registerPackingTools } from "./tools/packing.js";
import { registerKittingTools } from "./tools/kitting.js";
import { registerReplenishmentTools } from "./tools/replenishment.js";
import { registerPutawayTools } from "./tools/putaway.js";
import { registerStocktakeTools } from "./tools/stocktake.js";
import { registerAnalyticsTools } from "./tools/analytics.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  registerWhoamiTool(server);
  registerInventoryTools(server);
  registerProductTools(server);
  registerLocationTools(server);
  registerPackageTools(server);
  registerJobTools(server);
  registerSupplierTools(server);
  registerPurchaseOrderTools(server);
  registerStockMovementTools(server);
  registerAllocationTools(server);
  registerPickingTools(server);
  registerPackingTools(server);
  registerKittingTools(server);
  registerReplenishmentTools(server);
  registerPutawayTools(server);
  registerStocktakeTools(server);
  registerAnalyticsTools(server);

  return server;
}
