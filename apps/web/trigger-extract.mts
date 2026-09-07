/** Throwaway: trigger the vision-extraction sweep with a capped budget. */
import { runExtractionSweep } from "./src/server/catalogues/extraction-runner";

const r = await runExtractionSweep(new Date(), { manual: true });
console.log("page-extraction:", JSON.stringify(r));
process.exit(0);
