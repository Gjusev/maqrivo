import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { AssistantChat } from "./assistant-chat";

export default async function AssistantPage() {
  const t = await getTranslations("Assistant");
  return (
    <>
      <PageHeader title={t("title")} />
      <AssistantChat />
    </>
  );
}
