import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { catalogue, cataloguePage, promotion, retailer, store } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { Link } from "@/i18n/navigation";
import { PageUploader } from "./page-uploader";
import { PageCard } from "./page-card";

export default async function CatalogueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("Catalogues");
  const te = await getTranslations("Evidence");
  const locale = await getLocale();
  const session = await getSessionContext();
  if (!session) notFound();

  const row = (
    await db
      .select({ cat: catalogue, retailerName: retailer.name, retailerSlug: retailer.slug, storeName: store.name })
      .from(catalogue)
      .innerJoin(retailer, eq(catalogue.retailerId, retailer.id))
      .leftJoin(store, eq(catalogue.storeId, store.id))
      .where(eq(catalogue.id, id))
      .limit(1)
  )[0];
  if (!row) notFound();

  const pages = await db
    .select()
    .from(cataloguePage)
    .where(eq(cataloguePage.catalogueId, id))
    .orderBy(asc(cataloguePage.pageNumber));

  const promos = await db.select().from(promotion).where(eq(promotion.catalogueId, id));

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {row.cat.title ?? `${row.retailerName} · ${t("cataloguesTitle")}`}
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {[
            row.retailerName,
            row.storeName,
            row.cat.validFrom ? `${row.cat.validFrom} → ${row.cat.validUntil ?? "…"}` : null,
            `${String(pages.length)} ${t("pages")}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="space-y-5">
        <PageUploader catalogueId={id} />

        <p className="text-xs text-zinc-400">{t("reviewHint")}</p>

        {pages.length === 0 ? (
          <p className="card p-6 text-center text-sm text-zinc-500">{t("noCatalogues")}</p>
        ) : (
          pages.map((page) => (
            <PageCard
              key={page.id}
              catalogueId={id}
              pageId={page.id}
              pageNumber={page.pageNumber}
              defaultValidUntil={row.cat.validUntil ?? null}
              confirmedCount={promos.filter((p) => p.cataloguePageId === page.id).length}
            />
          ))
        )}

        {promos.length > 0 ? (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              {t("confirmed")} · {String(promos.length)}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {promos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href="/offers" className="min-w-0 truncate text-zinc-700 hover:text-brand-700">
                    {p.descriptionRaw}
                    <span className="ml-1.5 text-xs text-zinc-400">{te("extracted")}</span>
                  </Link>
                  {p.promoPriceCents != null ? (
                    <span className="shrink-0 font-semibold text-brand-700">
                      {new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" }).format(p.promoPriceCents / 100)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
