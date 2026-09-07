/** Throwaway: trigger the catalogue-sync and report per-retailer results. */
import { runCatalogueSync } from "./src/server/ingestion/catalogue-sync";
import "./src/server/integrations/retailers/adapters";

const r = await runCatalogueSync();
console.log("catalogue-sync:", JSON.stringify(r));
process.exit(0);
