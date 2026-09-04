/**
 * AI provider abstraction (ADR-0004): a deliberately small surface.
 * Z.AI general API via the OpenAI-compatible SDK. Keys are server-side only;
 * the provider is absent (not faked) when no key is configured.
 */
import OpenAI from "openai";
import type { ZodType } from "zod";

export interface StructuredCall<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
}

export interface ImageCall<T> {
  system: string;
  prompt: string;
  imageDataUrl: string;
  schema: ZodType<T>;
}

export class AIUnavailableError extends Error {
  constructor(message: string) {
    super(`ai-unavailable: ${message}`);
    this.name = "AIUnavailableError";
  }
}

export interface AIProvider {
  readonly name: string;
  readonly configured: boolean;
  generateStructured<T>(call: StructuredCall<T>): Promise<T>;
  analyzeImage<T>(call: ImageCall<T>): Promise<T>;
}

/** Delimiter for untrusted external content — never let it become instructions. */
export function untrusted(text: string): string {
  const clean = text.replace(/<<<DATA_END>>>/g, " ").slice(0, 8000);
  return `<<<UNTRUSTED_DATA_BEGIN>>>\n${clean}\n<<<UNTRUSTED_DATA_END>>>`;
}

export class ZaiProvider implements AIProvider {
  readonly name = "zai";
  private client: OpenAI | null;
  private readonly textModel: string;
  private readonly visionModel: string;

  constructor() {
    const apiKey = process.env.ZAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey, baseURL: "https://api.z.ai/api/paas/v4" }) : null;
    this.textModel = process.env.ZAI_TEXT_MODEL ?? "glm-5.3";
    this.visionModel = process.env.ZAI_VISION_MODEL ?? "glm-5.3-flash";
  }

  get configured(): boolean {
    return this.client !== null;
  }

  private require(): OpenAI {
    if (!this.client) throw new AIUnavailableError("ZAI_API_KEY not configured");
    return this.client;
  }

  async generateStructured<T>(call: StructuredCall<T>): Promise<T> {
    const client = this.require();
    const completion = await client.chat.completions.create({
      model: this.textModel,
      // glm-5.3 is a reasoning model: budget must cover thinking + output tokens.
      max_tokens: call.maxTokens ?? 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.user },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    try {
      return call.schema.parse(JSON.parse(stripJsonFences(raw)));
    } catch {
      throw new AIUnavailableError(`model output failed schema validation: ${raw.slice(0, 1200)}`);
    }
  }

  async analyzeImage<T>(call: ImageCall<T>): Promise<T> {
    const client = this.require();
    const completion = await client.chat.completions.create({
      model: this.visionModel,
      max_tokens: 4000,
      messages: [
        { role: "system", content: call.system },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: call.imageDataUrl } },
            { type: "text", text: call.prompt },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    try {
      return call.schema.parse(JSON.parse(stripJsonFences(raw)));
    } catch {
      throw new AIUnavailableError(`vision output failed schema validation: ${raw.slice(0, 160)}`);
    }
  }
}

/** Models often wrap JSON in markdown fences — strip them before parsing. */
export function stripJsonFences(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const text = fenced ? fenced[1]! : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  providerInstance ??= new ZaiProvider();
  return providerInstance;
}
