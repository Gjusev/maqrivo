import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { pushSubscription } from "@maqrivo/db";
import { urlBase64ToUint8Array } from "../src/lib/push-utils";
import { buildDigestPayload, DAILY_TITLES } from "../src/server/notifications/payload";

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url without padding", () => {
    // "-_8" is 0xFB 0xFF in base64url ("+/8" in std base64).
    const bytes = urlBase64ToUint8Array("-_8");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([251, 255]);
  });

  it("decodes standard padded input unchanged", () => {
    expect([...urlBase64ToUint8Array("AAEC")]).toEqual([0, 1, 2]);
    expect([...urlBase64ToUint8Array("AA==")]).toEqual([0]);
  });

  it("preserves every byte of a realistic 65-byte VAPID key", () => {
    // 65 uncompressed-EC-point bytes → 87 base64url chars, no padding needed.
    const raw = new Uint8Array(65).fill(200);
    let binary = "";
    for (const b of raw) binary += String.fromCharCode(b);
    const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect([...urlBase64ToUint8Array(encoded)]).toEqual([...raw]);
  });
});

describe("buildDigestPayload", () => {
  const deal = {
    id: "p1",
    descriptionRaw: "Lait demi-écrémé 6x1L",
    retailerName: "Carrefour",
    promoPriceCents: 449,
    regularPriceCents: 629,
    pricePerKgCents: null,
  };

  it("titles in the user's locale, defaulting to fr", () => {
    expect(buildDigestPayload(1, deal, "fr").title).toBe(DAILY_TITLES.fr);
    expect(buildDigestPayload(1, deal, "en").title).toBe(DAILY_TITLES.en);
    expect(buildDigestPayload(1, deal, "es").title).toBe(DAILY_TITLES.fr);
  });

  it("bodies the top deal with retailer, no suffix for a single offer", () => {
    const payload = buildDigestPayload(1, deal, "fr");
    expect(payload.body).toBe("Lait demi-écrémé 6x1L · Carrefour");
    expect(payload.url).toBe("/offers");
  });

  it("appends the remaining count when more deals are waiting", () => {
    expect(buildDigestPayload(5, deal, "en").body).toBe("Lait demi-écrémé 6x1L · Carrefour +4");
  });

  it("truncates the deal line to 100 chars before the suffix", () => {
    const long = { ...deal, descriptionRaw: "x".repeat(120), retailerName: "Lidl" };
    const payload = buildDigestPayload(2, long, "fr");
    expect(payload.body.startsWith("x".repeat(100))).toBe(true);
    expect(payload.body.length).toBe(103); // 100 truncated + " +1"
  });

  it("falls back to the bare count when no deal can be quoted", () => {
    expect(buildDigestPayload(3, null, "fr").body).toBe("3");
  });
});

describe("pushSubscription schema + upsert shape (drift guard)", () => {
  const config = getTableConfig(pushSubscription);

  it("keeps the documented columns", () => {
    expect(config.name).toBe("push_subscription");
    expect(config.columns.map((c) => c.name).sort()).toEqual(["auth", "created_at", "endpoint", "id", "p256dh", "user_id"]);
  });

  it("keeps endpoint unique — the upsert conflict target", () => {
    const endpoint = config.columns.find((c) => c.name === "endpoint");
    expect(endpoint?.isUnique).toBe(true);
  });

  it("upserts on endpoint, rewriting owner + keys", () => {
    const db = drizzle("postgres://maqrivo:maqrivo@localhost:5432/none");
    const query = db
      .insert(pushSubscription)
      .values({ userId: "user-1", endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: "p", auth: "a" })
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: { userId: "user-1", p256dh: "p2", auth: "a2" },
      })
      .toSQL();
    expect(query.sql).toContain('"push_subscription"');
    expect(query.sql).toContain('on conflict ("endpoint")');
    expect(query.sql).toContain("do update set");
  });
});
