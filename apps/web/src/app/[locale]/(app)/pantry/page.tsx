import { getLocale, getTranslations } from "next-intl/server";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { foodConcept, pantryItem, product } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { formatQuantity } from "@maqrivo/core";
import { ArchiveIcon } from "@phosphor-icons/react/dist/ssr/Archive";
import { PantryRow } from "./pantry-row";
import { AddPantryForm } from "./add-pantry-form";

export default async function PantryPage() {
  const t = await getTranslations("Pantry");
  const locale = await getLocale();
  const session = await getSessionContext();
  if (!session) return null;

  const rows = await db
    .select({ item: pantryItem, concept: foodConcept, product: product })
    .from(pantryItem)
    .leftJoin(foodConcept, eq(pantryItem.foodConceptId, foodConcept.id))
    .leftJoin(product, eq(pantryItem.productId, product.id))
    .where(eq(pantryItem.userId, session.userId))
    .orderBy(asc(pantryItem.expiresOn));

  const active = rows.filter((r) => r.item.status === "active");
  const done = rows.filter((r) => r.item.status !== "active");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="space-y-4">
        <AddPantryForm />

        {rows.length === 0 ? (
          <EmptyState icon={ArchiveIcon} title={t("empty")} />
        ) : (
          <>
            <ul className="space-y-2">
              {active.map(({ item, concept, product: p }) => {
                const label = concept
                  ? locale === "fr"
                    ? concept.nameFr
                    : concept.nameEn
                  : (p?.name ?? item.label ?? "?");
                const expiring = item.expiresOn !== null && item.expiresOn <= today;
                return (
                  <PantryRow
                    key={item.id}
                    itemId={item.id}
                    label={label}
                    quantityLabel={formatQuantity({ amount: Number(item.quantity), unit: item.unit as "g" }, locale)}
                    expiresOn={item.expiresOn}
                    expiring={expiring}
                  />
                );
              })}
            </ul>
            {done.length > 0 ? (
              <ul className="space-y-2 opacity-50">
                {done.map(({ item, concept, product: p }) => (
                  <li key={item.id} className="card flex items-center justify-between p-3 text-sm">
                    <span className="truncate">
                      {concept
                        ? locale === "fr"
                          ? concept.nameFr
                          : concept.nameEn
                        : (p?.name ?? item.label ?? "?")}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {item.status === "used_up" ? t("markFinished") : item.status === "consumed_by_plan" ? t("consumedByPlan") : t("markUsed")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
