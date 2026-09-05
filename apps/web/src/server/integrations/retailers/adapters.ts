/**
 * Adapter registration: imports register flipbook sources in the registry.
 * Only verified public endpoints get a line here (ADR-0005 — no anti-bot
 * bypass, no Bonial). An empty registry means the catalogue-sync job no-ops.
 */
import "./intermarche";
import "./lidl";
