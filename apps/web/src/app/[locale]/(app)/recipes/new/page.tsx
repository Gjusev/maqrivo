import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { RecipeEditor } from "../recipe-editor";

export default async function NewRecipePage() {
  const t = await getTranslations("Recipes");
  return (
    <>
      <PageHeader title={t("create")} />
      <RecipeEditor />
    </>
  );
}
