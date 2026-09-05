import { getTranslations } from "next-intl/server";
import { and, asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { retailer, store, userStorePrefs } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { MapPinIcon } from "@phosphor-icons/react/dist/ssr/MapPin";
import { formatDistance } from "@/lib/format";
import { StoreCard } from "./store-card";
import { DiscoverButton } from "./discover-button";
import { NewStoreLink } from "./new-store-link";
import { NearbyStores } from "./nearby-stores";
import { StoresMap } from "./stores-map";

export default async function StoresPage() {
  const t = await getTranslations("Stores");
  const session = await getSessionContext();
  if (!session) return null;

  const rows = await db
    .select({
      store: store,
      prefs: userStorePrefs,
      retailerName: retailer.name,
      retailerSlug: retailer.slug,
    })
    .from(userStorePrefs)
    .innerJoin(store, eq(userStorePrefs.storeId, store.id))
    .leftJoin(retailer, eq(store.retailerId, retailer.id))
    .where(eq(userStorePrefs.userId, session.userId))
    .orderBy(asc(userStorePrefs.distanceM));

  // Custom stores are always visible to their owner, prefs row or not.
  const owned = await db
    .select({ store: store, retailerName: retailer.name, retailerSlug: retailer.slug })
    .from(store)
    .leftJoin(retailer, eq(store.retailerId, retailer.id))
    .where(and(eq(store.ownerUserId, session.userId)));
  for (const row of owned) {
    if (!rows.some((r) => r.store.id === row.store.id)) {
      const { distanceMeters } = await import("@maqrivo/core");
      const distance =
        session.homeLat != null && session.homeLng != null
          ? distanceMeters({ lat: session.homeLat, lng: session.homeLng }, { lat: row.store.lat, lng: row.store.lng })
          : null;
      rows.push({
        store: row.store,
        prefs: { id: "", userId: session.userId, storeId: row.store.id, enabled: false, favorite: false, avoided: false, distanceM: distance, notes: null, updatedAt: new Date() },
        retailerName: row.retailerName,
        retailerSlug: row.retailerSlug,
      });
    }
  }

  const hasLocation = session.homeLat != null && session.homeLng != null;
  const visible = rows.filter((r) => (r.prefs.distanceM ?? Infinity) <= 5000 || r.store.ownerUserId !== null);
  const enabled = visible.filter((r) => r.prefs.enabled && !r.prefs.avoided);
  const others = visible.filter((r) => !(r.prefs.enabled && !r.prefs.avoided));
  const custom = others.filter((r) => r.store.ownerUserId !== null);
  const nearby = others.filter((r) => r.store.ownerUserId === null);

  return (
    <>
      <PageHeader
        title={t("title")}
        action={
          <div className="flex gap-2">
            <NewStoreLink />
            {hasLocation ? <DiscoverButton /> : null}
          </div>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={MapPinIcon}
          title={t("noStores")}
          action={hasLocation ? <DiscoverButton variant="primary" /> : undefined}
        />
      ) : (
        <div className="space-y-6">
          <StoresMap
            home={session.homeLat != null && session.homeLng != null ? { lat: session.homeLat, lng: session.homeLng } : null}
            stores={visible.slice(0, 200).map((r) => ({
              id: r.store.id,
              name: r.store.name,
              lat: r.store.lat,
              lng: r.store.lng,
              enabled: r.prefs.enabled,
              custom: r.store.ownerUserId !== null,
            }))}
          />

          {enabled.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-zinc-500">
                {t("enabledStores")} · {enabled.length}
              </h2>
              <ul className="space-y-2">
                {enabled.map((r) => (
                  <StoreCard
                    key={r.store.id}
                    storeId={r.store.id}
                    name={r.store.name}
                    retailer={r.retailerName ?? null}
                    format={r.store.format}
                    origin={r.store.origin}
                    tags={r.store.tags}
                    distanceLabel={r.prefs.distanceM != null ? formatDistance(r.prefs.distanceM) : null}
                    enabled={r.prefs.enabled}
                    favorite={r.prefs.favorite}
                    avoided={r.prefs.avoided}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {nearby.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-zinc-500">
                {t("nearby")} · {nearby.length}
              </h2>
              <p className="mb-2 text-xs text-zinc-400">{t("enabledHint")}</p>
              <NearbyStores
                stores={nearby.map((r) => ({
                  storeId: r.store.id,
                  name: r.store.name,
                  retailer: r.retailerName ?? null,
                  format: r.store.format,
                  origin: r.store.origin,
                  tags: r.store.tags,
                  distanceLabel: r.prefs.distanceM != null ? formatDistance(r.prefs.distanceM) : null,
                  enabled: r.prefs.enabled,
                  favorite: r.prefs.favorite,
                  avoided: r.prefs.avoided,
                }))}
              />
            </section>
          ) : null}

          {custom.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-zinc-500">
                {t("custom")} · {custom.length}
              </h2>
              <p className="mb-2 text-xs text-zinc-400">{t("ownStoresHint")}</p>
              <ul className="space-y-2">
                {custom.map((r) => (
                  <StoreCard
                    key={r.store.id}
                    storeId={r.store.id}
                    name={r.store.name}
                    retailer={r.retailerName ?? null}
                    format={r.store.format}
                    origin={r.store.origin}
                    tags={r.store.tags}
                    distanceLabel={r.prefs.distanceM != null ? formatDistance(r.prefs.distanceM) : null}
                    enabled={r.prefs.enabled}
                    favorite={r.prefs.favorite}
                    avoided={r.prefs.avoided}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
