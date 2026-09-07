"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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
}: {
  itemId: string;
  label: string;
  quantityLabel: string;
  expiresOn: string | null;
  expiring: boolean;
}) {
  const t = useTranslations("Pantry");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /** Server action + soft refresh — no full page reload. */
  const run = (action: () => Promise<unknown>) =>
    startTransition(async () => {
      await action();
      router.refresh();
    });

  const act = (action: () => Promise<unknown>) => {
    setConfirmingDelete(false);
    run(action);
  };

  return (
    <li
      className={`card flex items-center gap-3 p-3.5 transition-opacity ${expiring ? "border-amber-300 bg-amber-50/50" : ""} ${
        isPending ? "opacity-60" : ""
      }`}
    >
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
          disabled={isPending}
          onClick={() => act(() => adjustPantryQuantityAction(itemId, -1))}
        >
          <MinusIcon size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-ghost px-2"
          aria-label="+"
          disabled={isPending}
          onClick={() => act(() => adjustPantryQuantityAction(itemId, 1))}
        >
          <PlusIcon size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-ghost px-2 text-zinc-400"
          aria-label={t("markUsed")}
          disabled={isPending}
          onClick={() => act(() => setPantryStatusAction(itemId, "used_up"))}
        >
          <CheckIcon size={16} aria-hidden />
        </button>
        {confirmingDelete ? (
          <button
            type="button"
            className="btn-ghost px-2 text-xs font-semibold text-red-500"
            disabled={isPending}
            autoFocus
            onBlur={() => setConfirmingDelete(false)}
            onClick={() => run(() => deletePantryItemAction(itemId))}
          >
            {tc("confirm")}
          </button>
        ) : (
          <button
            type="button"
            className="btn-ghost px-2 text-zinc-300 hover:text-red-500"
            aria-label={t("remove")}
            disabled={isPending}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={16} aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}
