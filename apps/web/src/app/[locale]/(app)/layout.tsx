import { redirect } from "@/i18n/navigation";
import { getSessionContext } from "@/server/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, session] = await Promise.all([params, getSessionContext()]);
  if (!session) redirect({ href: "/sign-in", locale });
  return <AppShell>{children}</AppShell>;
}
