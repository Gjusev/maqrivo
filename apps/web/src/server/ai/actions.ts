"use server";

import { askAssistant, type AssistantMessage } from "./assistant";
import { generateRecipeWithAI, type GenerationConstraint } from "./recipe-generator";
import { getSessionContext } from "../session";

export async function askAssistantAction(history: AssistantMessage[]) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  return askAssistant(history);
}

export async function generateRecipeAction(constraint: GenerationConstraint) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const result = await generateRecipeWithAI(constraint);
  if (!result.ok) console.error("[ai-recipe]", JSON.stringify(result));
  return result;
}
