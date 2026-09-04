import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/server/session";
import { LocaleSwitcher } from "./locale-switcher";
import { LocationEditor } from "./location-editor";

export default async function ProfilePage() {
  const t = await getTranslations("Profile");
  const tc = await getTranslations("Common");
  const th = await getTranslations("Home");
  const session = await getSessionContext();
  if (!session) return null;

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="space-y-4">
        <section className="card p-5">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800">
              {session.userName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-zinc-900">{session.userName}</p>
              <p className="text-sm text-zinc-500">{session.userEmail}</p>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-zinc-900">{tc("language")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("languageHint")}</p>
          <div className="mt-3">
            <LocaleSwitcher current={session.locale} />
          </div>
        </section>

        <LocationEditor
          currentLabel={session.locationLabel}
          currentLat={session.homeLat}
          currentLng={session.homeLng}
        />

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-zinc-900">{t("nutrition")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{th("targetsBody")}</p>
        </section>
      </div>
    </>
  );
}
