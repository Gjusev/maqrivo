"use server";

import { z } from "zod";
import { askAssistant, type AssistantMessage } from "./assistant";
import { generateRecipeWithAI, type GenerationConstraint } from "./recipe-generator";
import { getSessionContext } from "../session";

/** Client-supplied chat history is untrusted: pin the roles, cap the size. */
const historySchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(4000),
    }),
  )
  .max(12);

export async function askAssistantAction(history: AssistantMessage[]) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = historySchema.safeParse(history);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return askAssistant(parsed.data);
}

export async function generateRecipeAction(constraint: GenerationConstraint) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const result = await generateRecipeWithAI(constraint);
  if (!result.ok) console.error("[ai-recipe]", JSON.stringify(result));
  return result;
}
