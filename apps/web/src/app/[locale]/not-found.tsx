import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
  const [t, tc] = await Promise.all([getTranslations("Errors"), getTranslations("Common")]);
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <p className="text-sm font-semibold text-zinc-900">{t("boundaryNotFound")}</p>
      <Link href="/" className="btn-primary mt-4">
        {tc("back")}
      </Link>
    </div>
  );
}
