import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { ingestionRun } from "@maqrivo/db";
import { getSessionContext, isAdmin } from "@/server/session";
import { TriggerButton } from "./trigger-button";

/**
 * Internal ingestion/debug view. Auth-gated; not linked from the main nav.
 * Trigger buttons are admin-only (the first registered account); the runs
 * list stays visible to every signed-in user as read-only telemetry.
 */
export default async function AdminIngestionPage() {
  const t = await getTranslations("Admin");
  const session = await getSessionContext();
  if (!session) redirect({ href: "/sign-in", locale: "fr" });
  const admin = await isAdmin();

  const runs = await db.select().from(ingestionRun).orderBy(desc(ingestionRun.startedAt)).limit(30);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{t("title")}</h1>
        {admin ? (
          <div className="flex gap-2">
            <TriggerButton jobKey="promotion-expiry" />
            <TriggerButton jobKey="pantry-consumption" />
            <TriggerButton jobKey="openprices-sync" />
            <TriggerButton jobKey="catalogue-sync" />
            <TriggerButton jobKey="page-extraction" />
            <TriggerButton jobKey="store-discovery" />
            <TriggerButton jobKey="plan-refresh" />
            <TriggerButton jobKey="digest-push" />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("adminOnly")}</p>
        )}
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("noRuns")}</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="card p-3.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900">
                  {run.source} · {run.kind}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    run.status === "succeeded"
                      ? "bg-brand-100 text-brand-800"
                      : run.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : run.status === "partial"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {t(run.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {run.startedAt.toISOString()} → {run.finishedAt?.toISOString() ?? "…"}
              </p>
              {run.stats ? (
                <p className="mt-1 font-mono text-xs text-zinc-600">
                  {Object.entries(run.stats)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join("  ")}
                </p>
              ) : null}
              {run.warnings && run.warnings.length > 0 ? (
                <ul className="mt-1 list-inside list-disc text-xs text-amber-600">
                  {run.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {run.error ? <p className="mt-1 text-xs text-red-600">{run.error}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
