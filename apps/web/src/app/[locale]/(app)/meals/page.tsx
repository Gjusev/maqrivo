import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ForkKnifeIcon } from "@phosphor-icons/react/dist/ssr/ForkKnife";

export default async function MealsPage() {
  const t = await getTranslations("Meals");
  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState icon={ForkKnifeIcon} title={t("title")} />
    </>
  );
}
