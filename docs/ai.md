# Maqrivo AI Integration (v1 — pending plan approval)

## Provider abstraction

Core application logic depends only on a three-method surface (`packages` boundary, `server/ai`):

```ts
interface AIProvider {
  generateText(prompt: TextPrompt): Promise<string>;
  generateStructured<T>(prompt: TextPrompt, schema: ZodSchema<T>): Promise<T>;
  analyzeImage(prompt: ImagePrompt): Promise<StructuredOrText>;
}
```

`ZaiProvider` implements it against `https://api.z.ai/api/paas/v4` using the official `openai` npm SDK with a custom `baseURL` (no official Z.AI TS SDK exists). Models come from env: `AI_PROVIDER=zai`, `ZAI_API_KEY`, `ZAI_TEXT_MODEL` (default `glm-5.3`), `ZAI_VISION_MODEL` (default `glm-5.3-flash`), `ZAI_BUDGET_MODEL` (default `glm-4.7`). The GLM Coding Plan is never used at runtime (ADR-0004). Keys never reach the browser; all inference is server-side.

## Division of authority

AI may: propose candidate recipes under constraints; normalize/parse messy product text; act as tiebreaker for AMBIGUOUS product matches (never sole matcher); extract structured candidates from catalogue page images; interpret user-supplied photos; phrase explanations whose reasons come from optimizer output; drive the conversational assistant via tools.

AI must not: compute any total (calories, macros, prices, per-kg, per-serving, budget); decide optimizer selections; assert halal status; create verified data. Every AI-produced number is re-computed deterministically; violations reject the candidate.

## Structured output pipeline

Z.AI offers `json_object` mode only (no schema enforcement): `generateStructured` runs a bounded loop — `json_object` call → Zod parse → on failure, one repair call with the validation errors → still failing surfaces a typed error. Every call records model, prompt version, validation status in `ai_extractions`.

## Prompt-injection defense

External text (catalogue pages, retailer payloads, OCR) is wrapped in explicit data delimiters with an instruction that content inside is data, never instructions; system prompts never include external content; the assistant's tools are scoped app functions with Zod-validated arguments; mutations require the same validation as the equivalent API route; AI outputs never gain privileges by claiming instructions. Web/catalogue content is never rendered as raw HTML.

## Assistant (in MVP scope per product decision)

Conversational surface over Maqrivo data. Read tools: `getNutritionTargets`, `getMealPlan`, `getPantry`, `searchProducts`, `searchStores`, `getCurrentOffers`, `calculateMacros` (deterministic core call), `explainShoppingPlan` (reads optimizer reason codes). Mutating tools: `replaceMeal`, `optimizeShoppingPlan` (re-run solver), `createProduct`, `createStore`, `addPriceObservation`, `addPantryItem` — each funnels through the same service-layer validation as REST routes. The DB is the source of truth; the assistant never fabricates prices or macros, and answers involving current prices cite observation freshness.

## Cost & safety controls

Rate limiting per user on AI endpoints; caps on image size and extract requests per catalogue page (content-hash dedup — unchanged pages are never re-analyzed); long-cache OFF-sourced nutrition so AI is not used for lookup; disclaimers: nutrition arithmetic, not medical advice (Z.AI ToS alignment).
