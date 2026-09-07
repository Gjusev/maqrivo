import { getTranslations } from "next-intl/server";
import { desc, eq, isNull, or, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { foodConcept, product } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { PackageIcon } from "@phosphor-icons/react/dist/ssr/Package";
import { ImportBarcode } from "./import-barcode";
import { NewProductLink } from "./new-product-link";
import { ProductList } from "./product-list";

export default async function ProductsPage() {
  const t = await getTranslations("Products");
  const session = await getSessionContext();
  if (!session) return null;

  const owned = or(eq(product.ownerUserId, session.userId), isNull(product.ownerUserId));
  const products = await db
    .select({ product: product, conceptFr: foodConcept.nameFr })
    .from(product)
    .leftJoin(foodConcept, eq(product.foodConceptId, foodConcept.id))
    .where(owned)
    .orderBy(desc(product.updatedAt))
    .limit(100);

  // Sibling count: the list is capped at 100 — the client hint says so instead
  // of truncating silently.
  const total = (await db.select({ total: sql<number>`count(*)::int` }).from(product).where(owned))[0]!.total;

  const items = products.map(({ product: p, conceptFr }) => ({
    id: p.id,
    name: p.name,
    sub: [
      p.brand,
      p.packageQuantity && p.packageUnit
        ? `${Number(p.packageQuantity)} ${p.packageUnit}`
        : p.purchasingMode === "WEIGHT"
          ? "⚖"
          : null,
      conceptFr,
      p.source === "off" ? "Open Food Facts" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        action={<NewProductLink />}
      />
      <div className="space-y-4">
        <ImportBarcode />

        {products.length === 0 ? (
          <EmptyState icon={PackageIcon} title={t("noProducts")} />
        ) : (
          <ProductList items={items} total={total} />
        )}
      </div>
    </>
  );
}
