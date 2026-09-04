import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { listReceipts } from "@/server/receipts/actions";
import { formatMoney } from "@maqrivo/core";
import { ReceiptIcon } from "@phosphor-icons/react/dist/ssr/Receipt";
import { Link } from "@/i18n/navigation";
import { ReceiptUploader } from "./receipt-uploader";

export default async function ReceiptsPage() {
  const t = await getTranslations("Receipts");
  const locale = await getLocale();
  const receipts = await listReceipts();

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="space-y-4">
        <ReceiptUploader />

        {receipts.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title={t("noReceipts")} />
        ) : (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/shopping/receipts/${r.id}`}
                  className="card flex items-center justify-between p-3.5 transition-colors hover:border-zinc-300"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-900">
                    {r.storeName}
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">
                      {r.purchasedOn} · {String(r.lineCount)} {t("lines").toLowerCase()}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-zinc-900">
                    {r.totalCents !== null ? formatMoney({ amountCents: r.totalCents, currency: "EUR" }, locale) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
