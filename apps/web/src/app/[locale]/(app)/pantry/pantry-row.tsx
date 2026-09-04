"use client";

import { useLocale, useTranslations } from "next-intl";
import { adjustPantryQuantityAction, deletePantryItemAction, setPantryStatusAction } from "@/server/recipes/actions";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";

export function PantryRow({
  itemId,
  label,
  quantityLabel,
  expiresOn,
  expiring,
  status,
}: {
  itemId: string;
  label: string;
  quantityLabel: string;
  expiresOn: string | null;
  expiring: boolean;
  status: string;
}) {
  const t = useTranslations("Pantry");
  const locale = useLocale();
  const router = { refresh: () => window.location.reload() };

  return (
    <li className={`card flex items-center gap-3 p-3.5 ${expiring ? "border-amber-300 bg-amber-50/50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900">{label}</p>
        <p className="text-xs text-zinc-500">
          {quantityLabel}
          {expiresOn ? ` · ${t("expiresOn")} ${new Date(expiresOn).toLocaleDateString(locale)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn-ghost px-2"
          aria-label="-"
          onClick={() => void adjustPantryQuantityAction(itemId, -1).then(() => router.refresh())}
        >
          <MinusIcon size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-ghost px-2"
          aria-label="+"
          onClick={() => void adjustPantryQuantityAction(itemId, 1).then(() => router.refresh())}
        >
          <PlusIcon size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-ghost px-2 text-zinc-400"
          aria-label={t("markUsed")}
          onClick={() => void setPantryStatusAction(itemId, "used_up").then(() => router.refresh())}
        >
          <CheckIcon size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-ghost px-2 text-zinc-300 hover:text-red-500"
          aria-label={t("remove")}
          onClick={() => void deletePantryItemAction(itemId).then(() => router.refresh())}
        >
          <TrashIcon size={16} aria-hidden />
        </button>
      </div>
      {status === "active" ? null : null}
    </li>
  );
}
