import { getTranslations } from "next-intl/server";
import { desc, eq, isNull, or } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { foodConcept, product } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { PackageIcon } from "@phosphor-icons/react/dist/ssr/Package";
import { ImportBarcode } from "./import-barcode";
import { NewProductLink } from "./new-product-link";
import { Link } from "@/i18n/navigation";

export default async function ProductsPage() {
  const t = await getTranslations("Products");
  const session = await getSessionContext();
  if (!session) return null;

  const products = await db
    .select({ product: product, conceptFr: foodConcept.nameFr })
    .from(product)
    .leftJoin(foodConcept, eq(product.foodConceptId, foodConcept.id))
    .where(or(eq(product.ownerUserId, session.userId), isNull(product.ownerUserId)))
    .orderBy(desc(product.updatedAt))
    .limit(100);

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
          <ul className="space-y-2">
            {products.map(({ product: p, conceptFr }) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.id}`}
                  className="card flex items-center gap-3 p-3.5 transition-colors hover:border-zinc-300"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                    <PackageIcon size={18} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900">{p.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {[
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
                        .join(" · ")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
