import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { GearIcon } from "@phosphor-icons/react/dist/ssr/Gear";

export default async function SettingsPage() {
  const t = await getTranslations("Settings");
  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState icon={GearIcon} title={t("title")} />
    </>
  );
}
