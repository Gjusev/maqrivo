import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/server/session";
import { LocaleSwitcher } from "./locale-switcher";
import { LocationEditor } from "./location-editor";
import { NutritionForm } from "./nutrition-form";
import { db } from "@/server/db";
import { nutritionProfile } from "@maqrivo/db";
import { desc, eq } from "drizzle-orm";

export default async function ProfilePage() {
  const t = await getTranslations("Profile");
  const tc = await getTranslations("Common");
  const session = await getSessionContext();
  if (!session) return null;

  const profile = (
    await db
      .select()
      .from(nutritionProfile)
      .where(eq(nutritionProfile.userId, session.userId))
      .orderBy(desc(nutritionProfile.createdAt))
      .limit(1)
  )[0];

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

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">{t("nutrition")}</h2>
          <NutritionForm
            initial={{
              dailyKcal: profile?.dailyKcal ?? null,
              proteinG: profile?.proteinG ?? null,
              carbohydrateG: profile?.carbohydrateG ?? null,
              fatG: profile?.fatG ?? null,
              fiberG: profile?.fiberG ?? null,
              mealsPerDay: profile?.mealsPerDay ?? 3,
              weeklyBudgetEuros:
                profile?.weeklyBudgetCents != null ? profile.weeklyBudgetCents / 100 : null,
              halalRequired: profile?.halalRequired ?? false,
              allowUnknownHalal: profile?.allowUnknownHalal ?? false,
              vegetarian: profile?.vegetarian ?? false,
              vegan: profile?.vegan ?? false,
              allergens: profile?.allergens ?? [],
            }}
          />
        </section>
      </div>
    </>
  );
}
