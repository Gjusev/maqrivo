"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { retailer, store, userStorePrefs, usersProfile } from "@maqrivo/db";
import { getSessionContext } from "../session";
import { runStoreDiscovery } from "./discovery";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const customStoreSchema = z.object({
  name: z.string().min(2).max(120),
  format: z.string().max(40).optional(),
  address: z.string().max(240).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().max(40).optional(),
  website: z.string().max(240).optional(),
  notes: z.string().max(500).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
});

export async function discoverStoresAction(): Promise<ActionResult<{ discovered: number; warnings: string[] }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  if (session.homeLat == null || session.homeLng == null) return { ok: false, error: "no-location" };
  try {
    const result = await runStoreDiscovery(session.userId);
    revalidatePath("/stores");
    return { ok: true, data: { discovered: result.discovered, warnings: result.warnings } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}

export async function setStorePrefsAction(
  storeId: string,
  prefs: { enabled?: boolean; favorite?: boolean; avoided?: boolean },
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  await db
    .insert(userStorePrefs)
    .values({ userId: session.userId, storeId, ...prefs })
    .onConflictDoUpdate({
      target: [userStorePrefs.userId, userStorePrefs.storeId],
      set: { ...prefs, updatedAt: new Date() },
    });
  revalidatePath("/stores");
  return { ok: true };
}

export async function createCustomStoreAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = customStoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const data = parsed.data;

  const independent = (
    await db.select().from(retailer).where(eq(retailer.slug, "independent")).limit(1)
  )[0];

  const inserted = (
    await db
      .insert(store)
      .values({
        retailerId: independent?.id ?? null,
        name: data.name,
        format: data.format ?? "specialty",
        address: data.address ?? null,
        lat: data.lat,
        lng: data.lng,
        origin: "user",
        ownerUserId: session.userId,
        source: "manual",
        phone: data.phone ?? null,
        website: data.website ?? null,
        tags: data.tags,
        lastVerifiedAt: new Date(),
      })
      .returning()
  )[0]!;

  if (session.homeLat != null && session.homeLng != null) {
    const { distanceMeters } = await import("@maqrivo/core");
    const distance = distanceMeters(
      { lat: session.homeLat, lng: session.homeLng },
      { lat: data.lat, lng: data.lng },
    );
    await db
      .insert(userStorePrefs)
      .values({ userId: session.userId, storeId: inserted.id, enabled: true, distanceM: distance })
      .onConflictDoNothing();
  }

  revalidatePath("/stores");
  return { ok: true, data: { id: inserted.id } };
}

const locationSchema = z.object({
  label: z.string().min(2).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function setLocationAction(input: unknown): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-location" };
  await db
    .update(usersProfile)
    .set({
      homeLat: parsed.data.lat,
      homeLng: parsed.data.lng,
      locationLabel: parsed.data.label,
      updatedAt: new Date(),
    })
    .where(eq(usersProfile.userId, session.userId));
  revalidatePath("/profile");
  revalidatePath("/stores");
  return { ok: true };
}

export async function deleteCustomStoreAction(storeId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  await db
    .delete(store)
    .where(and(eq(store.id, storeId), eq(store.ownerUserId, session.userId)));
  revalidatePath("/stores");
  return { ok: true };
}
