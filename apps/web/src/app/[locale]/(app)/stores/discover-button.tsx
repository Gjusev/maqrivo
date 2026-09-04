"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { discoverStoresAction } from "@/server/stores/actions";

export function DiscoverButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("Stores");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDiscover() {
    setPending(true);
    setMessage(null);
    const result = await discoverStoresAction();
    setPending(false);
    if (result.ok && result.data) {
      setMessage(t("discoveryDone", { count: result.data.discovered }));
    } else if (result.error === "no-location") {
      setMessage(t("noStores"));
    } else {
      setMessage(t("discoveryFailed"));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleDiscover()}
        disabled={pending}
        className={variant === "primary" ? "btn-primary" : "btn-secondary"}
      >
        {pending ? t("discovering") : t("discover")}
      </button>
      {message ? <span className="text-xs text-zinc-500">{message}</span> : null}
    </div>
  );
}
