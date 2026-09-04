"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";

export function NewStoreLink() {
  const t = useTranslations("Stores");
  return (
    <Link href="/stores/new" className="btn-secondary">
      <PlusIcon size={16} aria-hidden />
      {t("addCustom")}
    </Link>
  );
}
