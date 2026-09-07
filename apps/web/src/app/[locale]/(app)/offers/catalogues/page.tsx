import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { catalogue, cataloguePage, retailer } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CameraIcon } from "@phosphor-icons/react/dist/ssr/Camera";

/**
 * Every catalogue — the offers page only surfaces the freshest ten. Page-count
 * badges tell photo leaflets from structured shells; expired ones sink last.
 */
export default async function CatalogueListPage() {
  const t = await getTranslations("Catalogues");
  const te = await getTranslations("Evidence");
  const tc = await getTranslations("Common");
  const session = await getSessionContext();
  if (!session) notFound();

  // validUntil DESC NULLS LAST keeps live leaflets first and expired ones at
  // the bottom; createdAt breaks ties for undated rows.
  const rows = await db
    .select({ cat: catalogue, retailerName: retailer.name })
    .from(catalogue)
    .innerJoin(retailer, eq(catalogue.retailerId, retailer.id))
    .where(isNotNull(catalogue.id))
    .orderBy(sql`${catalogue.validUntil} desc nulls last`, desc(catalogue.createdAt));

  const pageCounts = new Map(
    (
      await db
        .select({ catalogueId: cataloguePage.catalogueId, pages: sql<number>`count(*)::int` })
        .from(cataloguePage)
        .groupBy(cataloguePage.catalogueId)
    ).map((row) => [row.catalogueId, row.pages] as const),
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link href="/offers" className="mb-2 inline-block text-xs text-zinc-500 hover:text-brand-700">
        ← {tc("back")}
      </Link>
      <PageHeader title={t("cataloguesTitle")} />

      {rows.length === 0 ? (
        <EmptyState icon={CameraIcon} title={t("noCatalogues")} />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ cat: c, retailerName }) => {
            const pages = pageCounts.get(c.id) ?? 0;
            const expired = c.validUntil != null && c.validUntil < today;
            return (
              <li key={c.id}>
                <Link
                  href={`/offers/catalogues/${c.id}`}
                  className="card flex items-center justify-between gap-3 p-3.5 transition-colors hover:border-zinc-300"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-900">
                    {c.title ?? `${retailerName} · ${t("cataloguesTitle")}`}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                    {pages > 0 ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">
                        {pages} {t("pages")}
                      </span>
                    ) : null}
                    {expired ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500">{te("expiredStatus")}</span>
                    ) : null}
                    <span>{[retailerName, c.validUntil].filter(Boolean).join(" · ")}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
