"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { usersProfile } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";

/**
 * Persist the preferred locale on the profile. Presentation only —
 * no domain row is touched by a language switch.
 */
export async function setUserLocale(locale: "fr" | "en"): Promise<void> {
  const session = await getSessionContext();
  if (!session) throw new Error("unauthorized");
  await db
    .update(usersProfile)
    .set({ locale, updatedAt: new Date() })
    .where(eq(usersProfile.userId, session.userId));
  revalidatePath("/profile");
}
