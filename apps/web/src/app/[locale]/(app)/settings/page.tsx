import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { LocaleSwitcher } from "@/app/[locale]/(app)/profile/locale-switcher";
import { getSessionContext } from "@/server/session";
import { openPricesWriteConfig } from "@/server/integrations/openprices-write";
import { DangerZone } from "./danger-zone";
import { NotificationsToggle } from "@/components/notifications-toggle";

export default async function SettingsPage() {
  const t = await getTranslations("SettingsPage");
  const tc = await getTranslations("Common");
  const th = await getTranslations("Profile");
  const session = await getSessionContext();
  if (!session) return null;
  const state = openPricesWriteConfig();

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-zinc-900">{tc("language")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{th("languageHint")}</p>
          <div className="mt-3">
            <LocaleSwitcher current={session.locale} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-zinc-900">{t("openPrices.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {state.enabled
              ? t("openPrices.enabled")
              : state.reason === "credentials-missing"
                ? t("openPrices.credentialsMissing")
                : t("openPrices.disabled")}
          </p>
        </section>

        <NotificationsToggle />

        <DangerZone
          labels={{
            title: t("deleteAccount"),
            hint: t("deleteHint"),
            confirm: t("deleteConfirm"),
            button: t("deleteAccount"),
          }}
        />
      </div>
    </>
  );
}
