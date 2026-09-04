import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { receipt, store } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { getReceiptLines } from "@/server/receipts/actions";
import { formatMoney } from "@maqrivo/core";
import { Link } from "@/i18n/navigation";
import { ReceiptLines } from "./receipt-lines";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("Receipts");
  const locale = await getLocale();
  const session = await getSessionContext();
  if (!session) notFound();

  const row = (
    await db
      .select({ receipt: receipt, storeName: store.name })
      .from(receipt)
      .innerJoin(store, eq(receipt.storeId, store.id))
      .where(eq(receipt.id, id))
      .limit(1)
  )[0];
  if (!row || row.receipt.userId !== session.userId) notFound();

  const lines = await getReceiptLines(id);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {row.storeName} · {row.receipt.purchasedOn}
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {row.receipt.totalCents !== null
            ? `${t("total")}: ${formatMoney({ amountCents: row.receipt.totalCents, currency: "EUR" }, locale)}`
            : t("lineHint")}
        </p>
      </div>

      <div className="space-y-4">
        {row.receipt.evidenceId ? (
          <a
            href={`/api/evidence/${row.receipt.evidenceId}`}
            target="_blank"
            rel="noreferrer"
            className="card block overflow-hidden bg-zinc-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated local upload */}
            <img
              src={`/api/evidence/${row.receipt.evidenceId}`}
              alt={t("receiptPhoto")}
              className="max-h-80 w-full object-contain"
            />
          </a>
        ) : null}

        <ReceiptLines receiptId={id} initialLines={lines} />
      </div>

      <p className="mt-6 text-center text-xs text-zinc-400">
        <Link href="/shopping/receipts" className="text-brand-700 hover:underline">
          ← {t("title")}
        </Link>
      </p>
    </>
  );
}
