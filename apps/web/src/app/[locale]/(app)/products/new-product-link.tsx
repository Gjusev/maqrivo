"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";

export function NewProductLink() {
  const t = useTranslations("Products");
  return (
    <Link href="/products/new" className="btn-secondary">
      <PlusIcon size={16} aria-hidden />
      {t("createManually")}
    </Link>
  );
}
