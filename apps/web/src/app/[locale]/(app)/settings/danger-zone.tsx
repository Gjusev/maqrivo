"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/auth-client";
import { deleteAccountAction } from "@/server/profile/actions";

export function DangerZone({
  labels,
}: {
  labels: { title: string; hint: string; confirm: string; button: string };
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <section className="card border-red-200 p-5">
      <h2 className="text-sm font-semibold text-red-700">{labels.title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{labels.hint}</p>
      <button
        type="button"
        className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 active:scale-[0.98]"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm(labels.confirm)) return;
          setPending(true);
          const result = await deleteAccountAction();
          if (result.ok) {
            await signOut();
            router.replace("/sign-in");
            router.refresh();
          } else {
            setPending(false);
          }
        }}
      >
        {pending ? "…" : labels.button}
      </button>
    </section>
  );
}
