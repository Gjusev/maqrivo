"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setStorePrefsAction } from "@/server/stores/actions";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { ProhibitIcon } from "@phosphor-icons/react/dist/csr/Prohibit";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";

export interface StoreCardProps {
  storeId: string;
  name: string;
  retailer: string | null;
  format: string | null;
  origin: string;
  tags: string[];
  distanceLabel: string | null;
  enabled: boolean;
  favorite: boolean;
  avoided: boolean;
}

export function StoreCard(props: StoreCardProps) {
  const t = useTranslations("Stores");
  const [, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic(
    { enabled: props.enabled, favorite: props.favorite, avoided: props.avoided },
    (current, update: Partial<{ enabled: boolean; favorite: boolean; avoided: boolean }>) => ({
      ...current,
      ...update,
    }),
  );

  const update = (prefs: Partial<{ enabled: boolean; favorite: boolean; avoided: boolean }>) => {
    startTransition(async () => {
      setOptimistic(prefs);
      await setStorePrefsAction(props.storeId, prefs);
    });
  };

  const meta = [
    props.distanceLabel,
    props.format,
    props.origin === "user" ? t("customStore") : null,
    ...props.tags.filter((tag) => tag !== "cheap"),
  ]
    .filter(Boolean)
    .slice(0, 4) as string[];

  return (
    <li className={`card flex items-center gap-3 p-3.5 ${state.avoided ? "opacity-50" : ""}`}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
        <MapPinIcon size={18} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900">
          {props.name}
          {props.retailer && props.retailer !== props.name ? (
            <span className="ml-1.5 text-xs font-normal text-zinc-400">{props.retailer}</span>
          ) : null}
        </p>
        {meta.length > 0 ? <p className="truncate text-xs text-zinc-500">{meta.join(" · ")}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={`btn-ghost px-2 ${state.favorite ? "text-amber-500" : "text-zinc-300"}`}
          aria-label={t("favorite")}
          aria-pressed={state.favorite}
          onClick={() => update({ favorite: !state.favorite })}
        >
          <StarIcon size={18} weight={state.favorite ? "fill" : "regular"} aria-hidden />
        </button>
        <button
          type="button"
          className={`btn-ghost px-2 ${state.avoided ? "text-red-500" : "text-zinc-300"}`}
          aria-label={t("avoid")}
          aria-pressed={state.avoided}
          onClick={() =>
            update({ avoided: !state.avoided, enabled: state.avoided ? false : state.enabled })
          }
        >
          <ProhibitIcon size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={state.enabled ? "btn-secondary px-3 text-xs text-brand-700" : "btn-primary px-3 text-xs"}
          onClick={() => update({ enabled: !state.enabled, avoided: false })}
        >
          {state.enabled ? t("enabled") : t("enable")}
        </button>
      </div>
    </li>
  );
}
