"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { toggleSlotLockAction } from "@/server/plans/actions";
import { LockSimpleOpenIcon } from "@phosphor-icons/react/dist/csr/LockSimpleOpen";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";

export interface GridSlot {
  id: string;
  mealType: string;
  recipeName: string | null;
  recipeId: string | null;
  locked: boolean;
}

export interface GridDay {
  dayKey: string;
  date: string;
  slots: GridSlot[];
}

export function WeekGrid({ days }: { days: GridDay[] }) {
  const t = useTranslations("Week");
  const tm = useTranslations("Today");
  const [, startTransition] = useTransition();
  const [locked, setLocked] = useOptimistic(
    new Map(days.flatMap((d) => d.slots.map((s) => [s.id, s.locked] as const))),
    (current, update: { id: string; locked: boolean }) => new Map(current).set(update.id, update.locked),
  );

  const mealOrder = ["breakfast", "lunch", "dinner", "snack"];
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <div
          key={day.date}
          className={`card p-3 ${day.date === todayIso ? "border-brand-300 ring-1 ring-brand-200" : ""}`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t(day.dayKey as never)} · {new Date(`${day.date}T00:00:00Z`).toLocaleDateString()}
          </p>
          <ul className="space-y-1">
            {[...day.slots]
              .sort((a, b) => mealOrder.indexOf(a.mealType) - mealOrder.indexOf(b.mealType))
              .map((slot) => {
                const isLocked = locked.get(slot.id) ?? slot.locked;
                return (
                  <li key={slot.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-xs capitalize text-zinc-400">
                      {tm(slot.mealType as never)}
                    </span>
                    {slot.recipeName && slot.recipeId ? (
                      <Link href={`/recipes/${slot.recipeId}`} className="min-w-0 flex-1 truncate text-zinc-800 hover:text-brand-700">
                        {slot.recipeName}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate italic text-zinc-300">{t("emptySlot")}</span>
                    )}
                    <button
                      type="button"
                      aria-label={isLocked ? t("unlock") : t("lock")}
                      aria-pressed={isLocked}
                      className={`btn-ghost px-2 ${isLocked ? "text-brand-700" : "text-zinc-300"}`}
                      onClick={() =>
                        startTransition(async () => {
                          setLocked({ id: slot.id, locked: !isLocked });
                          await toggleSlotLockAction(slot.id);
                        })
                      }
                    >
                      {isLocked ? <LockSimpleIcon size={15} weight="fill" aria-hidden /> : <LockSimpleOpenIcon size={15} aria-hidden />}
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
