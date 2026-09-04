# Z.AI (Zhipu AI / GLM) API Research for Maqrivo

Researched: 2026-09-04. All claims cite official documentation (docs.z.ai, z.ai, docs.bigmodel.cn). Where the docs do not state something, "not documented" is used.

## API surface

### International / general API (what Maqrivo would use)

| Item | Value |
|---|---|
| Base URL | `https://api.z.ai/api/paas/v4` |
| Chat completions | `POST https://api.z.ai/api/paas/v4/chat/completions` |
| Auth | `Authorization: Bearer <API_KEY>` (API keys managed at https://z.ai/manage-apikey/apikey-list) |
| OpenAI-compatible | Yes — official docs show OpenAI Python/Node/Java SDK examples with this `base_url`/`baseURL` |
| Streaming | `stream: true`; SSE chunks terminate with `data: [DONE]`; tool-call streaming via `tool_stream: true` |
| Optional header | `Accept-Language` (default `en-US,en`) |

Sources: https://docs.z.ai/api-reference/introduction , https://docs.z.ai/guides/overview/quick-start , https://docs.z.ai/api-reference/llm/chat-completion

### Separate endpoints (Coding Plan only — see "Coding Plan vs General API terms")

| Protocol | Base URL |
|---|---|
| Anthropic Messages | `https://api.z.ai/api/anthropic` |
| OpenAI Chat Completions (coding) | `https://api.z.ai/api/coding/paas/v4` |
| OpenAI Responses | `https://api.z.ai/api/v1` |

Source: https://docs.z.ai/devpack/quick-start , https://docs.z.ai/devpack/tool/others

### China platform (bigmodel.cn) — alternative, likely irrelevant for Maqrivo

- Base URL: `https://open.bigmodel.cn/api/paas/v4/` — also OpenAI-compatible (swap key + base URL).
- Source: https://docs.bigmodel.cn/cn/guide/develop/openai/introduction

## Models & pricing

All prices per 1M tokens, USD, from https://docs.z.ai/guides/overview/pricing (checked 2026-09-04). Model IDs and per-model limits cross-checked against https://docs.z.ai/api-reference/llm/chat-completion .

### Text models

| Model ID | Input | Cached input | Output | Context | Max output |
|---|---|---|---|---|---|
| `glm-5.3` | $1.4 | $0.26 | $4.4 | 1M | 128K |
| `glm-5.2` | $1.4 | $0.26 | $4.4 | 1M | 128K |
| `glm-5.1` | $1.4 | $0.26 | $4.4 | not documented on model page | 128K |
| `glm-5` | $1.0 | $0.20 | $3.2 | not documented | not documented |
| `glm-4.7` | $0.6 | $0.11 | $2.2 | not documented | 128K |
| `glm-4.7-flashx` | $0.07 | $0.01 | $0.40 | not documented | not documented |
| `glm-4.6` | $0.6 | $0.11 | $2.2 | ~200K class | 128K |
| `glm-4.5` / `-air` / `-x` / `-airx` | $0.6 / $0.2 / $2.2 / $1.1 | — | $2.2 / $1.1 / $8.9 / $4.5 | — | 96K (4.5) |
| `glm-4-32b-0414-128k` | $0.1 | — | $0.1 | 128K (name) | 16K |

- Model page sources: https://docs.z.ai/guides/llm/glm-5.3.md , https://docs.z.ai/guides/llm/glm-5.2.md
- `glm-5.3` and `glm-5.2`: reasoning always on (`thinking.type` accepts only `enabled`; disabling "no longer supported"); `reasoning_effort` for glm-5.3 supports `low`, `high`, `max` (default `max`).

### Vision models (multimodal input: image / video / file)

| Model ID | Input | Cached | Output | Context | Max output | Notes |
|---|---|---|---|---|---|---|
| `glm-5.3-flash` | $0.075 (list $0.15) | $0.015 | $0.25 (list $0.50) | 1M | 128K | Flagship multimodal; thinking always on; FC + JSON; 3x coding-plan quota |
| `glm-4.6v` | $0.3 | $0.05 | $0.9 | 128K | 32K | Native function calling; thinking toggleable |
| `glm-4.6v-flashx` | $0.04 | $0.004 | $0.40 | 128K | not documented | Fast/cheap |
| `glm-4.6v-flash` | Free | Free | Free | 128K | not documented | Free tier |
| `glm-4.5v` | $0.6 | $0.11 | $1.8 | not documented | 16K | Older |
| `glm-ocr` | $0.03 | — | $0.03 | not documented | — | 0.9B OCR/doc-parsing; images ≤10MB, PDF ≤50MB/100 pages; outputs Markdown/JSON |

- Sources: https://docs.z.ai/guides/vlm/glm-5.3-flash.md , https://docs.z.ai/guides/vlm/glm-4.6v.md , https://docs.z.ai/guides/vlm/glm-ocr.md
- `glm-5.3-flash` promo (50% off) ends "24:00 on September 9, 2026 (UTC+8)"; after that $0.15 in / $0.50 out (pricing page).

### Free tier

- Free models (input, cached, output all free): `glm-4.7-flash`, `glm-4.5-flash`, `glm-4.6v-flash`. No other free quota is documented. Source: pricing page.
- Cached-input storage listed as "Limited-time Free" on most paid models.

### Other tools (pricing page)

- Web Search tool: $0.01/use; GLM-Image: $0.015/image; CogView-4: $0.01/image; CogVideoX-3: $0.2/video; GLM-ASR-2512: $0.03/MTok.

## Structured output

Source: https://docs.z.ai/guides/capabilities/struct-output , https://docs.z.ai/api-reference/llm/chat-completion

- JSON mode: `response_format: {"type": "json_object"}`. The API reference documents the `response_format.type` enum as exactly `text` | `json_object`.
- **No `json_schema` / strict schema enforcement is documented.** The official pattern is: describe the schema in the system prompt, then validate client-side (docs recommend `jsonschema` in Python; for TS use Zod) and handle `JSONDecodeError`/`ValidationError`.
- Docs explicitly recommend models "such as `glm-5`, `glm-4.7`, `glm-4.5`, `glm-4.6`"; the glm-5.2/glm-5.3/5.3-flash model pages also claim structured-output support.
- Implication for Maqrivo: recipe JSON is not schema-guaranteed by the API — a validate-and-repair loop (or one retry with the validation error appended) is required.

## Tool calling

Source: https://docs.z.ai/guides/capabilities/function-calling , https://docs.z.ai/api-reference/llm/chat-completion

- Request: `tools: [{"type": "function", "function": {name, description, parameters (JSON Schema)}}]`; max 128 functions. Text-schema models also accept built-in `web_search` and `retrieval` tool types; vision-schema models accept `function` only.
- `tool_choice`: **only `"auto"` is supported** — no `none`/`required`/forced-function, and no OpenAI-style `strict` schema mode is documented.
- Response: `message.tool_calls[]` with `id`, `function.name`, `function.arguments` (JSON string); reply with `{"role": "tool", "content": ..., "tool_call_id": id}`. `finish_reason: "tool_calls"` exists.
- Streaming of tool calls: `tool_stream: true` (separate guide: https://docs.z.ai/guides/capabilities/stream-tool).
- Parallel calls: not explicitly documented; examples iterate over multiple `tool_calls` in one response.
- `glm-5.3`, `glm-5.2`, `glm-4.6v`, `glm-5.3-flash` all document function-calling support (model pages).

## Vision

Source: https://docs.z.ai/api-reference/llm/chat-completion (multimodal content parts), model pages above.

- Image input: content part `{"type": "image_url", "image_url": {"url": <URL or Base64>}}`; image < 5MB, ≤ 6000×6000 px, jpg/png/jpeg; up to 150 images per request for GLM-5V/GLM-4.6V class, 50 for GLM-4.5V.
- Video input: `video_url.url` ≤ 200MB, mp4/mkv/mov; 2 videos (1 for GLM-4.5V).
- File input: `file_id` / `file_url` / `file_data` (Base64 data URI), ≤ 50MB/file, max 50 files; pdf/txt/word/jsonl/xlsx/pptx; cannot mix `file` with `image_url`/`video_url` in one part.
- Vision-model enum in API reference: `glm-5.3-flash`, `glm-4.6v`, `autoglm-phone-multilingual`, `glm-4.6v-flash`, `glm-4.6v-flashx`, `glm-4.5v`.
- `glm-5.3-flash` accepts video/image/text/file with 1M context; recommended params `temperature: 1`, `top_p: 0.95`, `reasoning_effort: max` (model page).
- The "Vision MCP Server" is a GLM Coding Plan exclusive perk, not part of the general API (https://docs.z.ai/devpack/mcp/vision-mcp-server).

## Rate limits

- The public docs page https://docs.z.ai/api-reference/rate-limit **redirects (307) to the login-gated console** https://z.ai/manage-apikey/rate-limits — no public RPM/TPM/concurrency table exists. Exact numbers: **not documented publicly**; visible per-key in the console.
- What is documented: concurrency is "set by the platform to ensure service stability" (https://docs.z.ai/guides/overview/concept-param); Coding Plan concurrency is tier-based (Max > Pro > Lite) and dynamically adjusted, with higher off-peak limits (https://docs.z.ai/devpack/usage-policy).
- Relevant error codes (https://docs.z.ai/api-reference/api-code): `1302` rate limit reached; `1113` insufficient balance; `1305` overloaded; `1308`/`1310` usage caps; `1313` Fair-Usage-Policy frequency limit; `1261` prompt too long; `1301` sensitive content; streaming failures surface via `finish_reason` (incl. `model_context_window_exceeded`).
- Community reports indicate low concurrency (e.g. ~1 concurrent on free/entry access) — treat as anecdote, not doc.

## Coding Plan vs General API terms (explicit)

### GLM Coding Plan (a.k.a. DevPack) — NOT usable as Maqrivo's runtime backend

- Price/quota: starts at **$18/month**; credits: Lite 2,000/5h + 10,000/week; Pro 12,000/5h + 60,000/week; Max 28,000/5h + 140,000/week. Models: `glm-5.3` and `glm-5.3-flash` (legacy IDs glm-5.2/5.1 → glm-5.3; glm-4.7 → glm-5.3-flash). Off-peak = 50% credits. Source: https://docs.z.ai/devpack/overview
- Permitted use: "GLM Coding Plan may only be used within officially supported tools and products" — a list of coding agents (ZCode, Claude Code, Claude for IDE, Codex, OpenCode, Pi, Cursor, Cline, TRAE, Qoder, Droid, Kilo Code, Roo Code, Crush, Goose, Eigent) plus best-effort general agents (OpenClaw, Hermes Agent, SillyTavern). Sources: https://docs.z.ai/devpack/quick-start , https://docs.z.ai/devpack/tool/others
- Subscription terms are explicit: quota may only be used "within officially supported tools"; must NOT be used for "general-purpose API access or any scenarios outside such tools"; prohibited: "directly invoking model APIs from your own applications, bots, websites, SaaS products or other systems" unless you have "a separate written agreement with Z.ai"; no resale/proxy/multi-user sharing. Source: https://docs.z.ai/legal-agreement/subscription-terms
- Enforcement: "Use in unsupported tools may result in restricted benefits"; violations → rate limiting, freezing, bans after 3 violations; no refunds. Source: https://docs.z.ai/devpack/usage-policy
- **Conclusion: the developer's Coding Plan key may power Claude Code etc., but MUST NOT power Maqrivo's recipe generation, assistant, or image analysis. Maqrivo needs the pay-as-you-go general API with its own API key.**

### General API terms (relevant to a personal nutrition app)

Source: https://docs.z.ai/legal-agreement/terms-of-use (incl. API Additional Terms) and https://docs.z.ai/legal-agreement/privacy-policy

- Permitted: the API is licensed for "integrating into your apps or building downstream systems for End Users" (Additional Terms §1(a)) — i.e., an app backend is an intended use.
- Training/retention: for API users, "we will not use your User Content for developing or improving Services unless you explicitly agree" (Terms §IV.7); "We will not use End User Content to develop or improve Services, unless you explicitly agree" (Additional Terms §3(b)). The DPA states "The Company do not store any of the content the Customer or its End Users provide or generate while using our Services" (§4b) and deletes data after termination. **Contrast:** consumer (chat) users' content may be used to improve services under a broad license — another reason to use the API, not the chat product.
- Data location / EU: services "generally provided from Singapore"; data "generally processed in Singapore". **No named GDPR transfer instrument (SCCs, adequacy) and no subprocessor list are documented** — a compliance gap if Maqrivo ever serves EU third parties. For a personal self-hosted app this is a risk to note, not necessarily a blocker. A Data Processing Addendum governs API data handling (Additional Terms §2(a)).
- Health restrictions: may not use Z.ai "as a substitute for professional services, including ... medical care" (§III.6(b)); no "high-risk automated decision-making" in areas including health (§III.6(a)); no use "for any services requiring specific qualifications, including ... healthcare ... medical decisions" (Additional Terms §1(f)). For US use: must not "process, store, or transmit any Protected Health Information (PHI)" (§III.11). A personal nutrition/recipe app giving general suggestions is arguably fine, but the app should avoid medical/nutritional-therapy claims and include disclaimers.
- Other notable: must disclose AI use to users/regulators (Additional Terms §1(d)); may not train competing models with outputs; liability cap is very low (greater of 6 months' fees or $100); payments non-refundable; no scraping/reverse engineering; cannot remove AI identifiers from outputs.

## SDKs

- **Python (official):** `pip install zai-sdk` (docs pin `zai-sdk==0.2.3`); `ZaiClient(api_key=...)`. https://docs.z.ai/guides/develop/python/introduction
- **Java (official):** Maven/Gradle `ai.z.openapi:zai-sdk:0.3.5`. https://docs.z.ai/guides/develop/java/introduction
- **TypeScript/JavaScript:** **There is no official, published TS SDK.**
  - GitHub `THUDM/z-ai-sdk-typescript` exists but is marked "Not yet released" (3 commits, no releases; no mention of tool calling/vision). https://github.com/THUDM/z-ai-sdk-typescript
  - The npm package `zai-sdk` was **unpublished in April 2022** and is unavailable (checked registry.npmjs.org on 2026-09-04).
  - Officially documented JS path: use the **OpenAI Node SDK** with `baseURL: "https://api.z.ai/api/paas/v4"` — shown in the official quick start/introduction. https://docs.z.ai/api-reference/introduction
- LangChain integration guide exists (https://docs.z.ai/guides/develop/langchain/introduction).

## Recommended integration for Maqrivo

1. **Transport:** official `openai` npm package, `baseURL: https://api.z.ai/api/paas/v4`, key from https://z.ai/manage-apikey/apikey-list, stored server-side only (self-hosted backend). Do not ship the key to browsers.
2. **Recipe generation (structured JSON):** `glm-5.3` (highest quality, $1.4/$4.4) or `glm-4.7` (budget, $0.6/$2.2). Use `response_format: {"type": "json_object"}` + JSON Schema in the system prompt + Zod validation with a one-shot repair retry. Note reasoning is always on for glm-5.3 — set `reasoning_effort: "low"` for simple recipes to save output tokens (which are billed at the output rate).
3. **Assistant over app data (tool calling):** `glm-5.3` with `tools` (function definitions over your pantry/recipes queries), `tool_choice: "auto"` (only option). Implement the tool-result round trip (`role: "tool"` + `tool_call_id`) and use `tool_stream` if streaming. Budget alternative: `glm-4.7`; free: `glm-4.7-flash`.
4. **Image analysis (catalogue pages, product photos):** `glm-5.3-flash` (vision, 1M context, $0.075/$0.25 through 2026-09-09, then $0.15/$0.50) via `image_url` parts (URL or Base64). Free option: `glm-4.6v-flash`. For dense OCR (receipts, price labels, catalogue tables): `glm-ocr` at $0.03/MTok, which outputs Markdown/JSON and explicitly covers receipt/invoice extraction.
5. **Keep the Coding Plan strictly for development tooling** (Claude Code, Cursor, etc.) on the dedicated `api.z.ai/api/coding/*` endpoints. Never reuse that key in Maqrivo.
6. **Error handling:** implement retries with backoff for `1302`/`1305`, balance checks for `1113`, and treat `finish_reason: sensitive`/`1301` as a content-filter path.

## Risks

1. **Coding Plan misuse = account risk.** Using the subscription key as an app backend violates the subscription terms (restricted benefits, suspension, no refunds). Budget for pay-as-you-go spend.
2. **No strict schema enforcement.** `json_object` only — no `json_schema`/strict mode. Every structured feature needs client-side validation and a repair path; expect occasional malformed output.
3. **`tool_choice` limited to `auto`.** No forced tool calls; a strictly-tool-driven flow needs prompt engineering and a fallback.
4. **Always-on reasoning for glm-5.3/5.3-flash** inflates output tokens (billed) and latency; mitigate with `reasoning_effort: "low"` where quality allows.
5. **Pricing volatility.** Active promo ends 2026-09-09; model lineup churns fast (glm-5.2 → 5.3 routing already changed on Coding Plan). Pin model IDs per feature and re-check the pricing page each quarter.
6. **Rate limits are opaque.** No public RPM/TPM table; low concurrency reported anecdotally. Check the console before load testing; Maqrivo is single-user so risk is low.
7. **GDPR gap.** Processing in Singapore with no documented SCC/adequacy mechanism or subprocessor list. Fine for a personal self-hosted app; not fine without legal review if other EU users' data (esp. dietary/health-adjacent) is sent.
8. **Health-related ToS clauses.** Nutrition output must not mimic professional/medical advice; avoid PHI entirely; add disclaimers (ToS §III.6, Additional Terms §1(f), §III.11).
9. **Content filtering** (`1301` / `finish_reason: sensitive`) can silently truncate outputs — handle it explicitly.
10. **No official TS SDK** — the OpenAI SDK path is officially documented and stable, but you depend on OpenAI-compatibility remaining in sync (e.g., Z.AI-specific params like `thinking`, `reasoning_effort`, `tool_stream` are extensions you may call via `fetch` or typed loosely).
