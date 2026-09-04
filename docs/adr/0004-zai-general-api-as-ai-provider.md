# Z.AI general API (not the Coding Plan) behind a minimal AIProvider abstraction

Runtime AI goes through the Z.AI general pay-as-you-go API (`https://api.z.ai/api/paas/v4`, OpenAI-compatible, called with the official `openai` npm SDK and a different baseURL) using its own API key from `AI_PROVIDER`/`ZAI_API_KEY` env vars. Model defaults are env-overridable: `glm-5.3` for text/tool-calling (recipe generation, assistant), `glm-5.3-flash` for vision (catalogue/product images), `glm-4.7` as the budget text option. Core logic depends only on a three-method AIProvider surface (generateText / generateStructured / analyzeImage); Z.AI is the first implementation, not a hardwired dependency.

The GLM Coding Plan is contractually limited to supported development tools and explicitly bars backing one's own applications — it must never be Maqrivo's runtime backend (verified against current Z.AI subscription terms, 2026-09-04).

## Consequences

- Z.AI's structured output is `json_object` mode only (no schema enforcement): every structured call is Zod-validated with a bounded repair loop; unparseable output is surfaced as an error, never guessed.
- Z.AI processing happens in Singapore with no documented SCCs — accepted for this personal-use app; the abstraction keeps an EU-resident provider swap cheap if that changes.
- Z.AI ToS bars medical-advice positioning: Maqrivo presents nutrition arithmetic, never medical guidance.
- API keys live server-side only; every inference request passes through the backend.
