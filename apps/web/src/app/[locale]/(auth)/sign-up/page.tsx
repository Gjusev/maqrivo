"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { signUpWithInvite } from "@/lib/auth-client";

export default function SignUpPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      setPending(false);
      return;
    }
    const result = await signUpWithInvite({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password,
      inviteCode: String(form.get("inviteCode") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error === "emailInUse" ? t("emailInUse") : t("invalidInviteCode"));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold tracking-tight text-zinc-900">{t("signUpTitle")}</h1>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <div>
          <label htmlFor="name">{t("name")}</label>
          <input id="name" name="name" type="text" autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="email">{t("email")}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password">{t("password")}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <div>
          <label htmlFor="inviteCode">{t("inviteCode")}</label>
          <input id="inviteCode" name="inviteCode" type="text" required />
        </div>
        {error ? <p className="field-error">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {t("signUp")}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        {t("haveAccount")}{" "}
        <Link href="/sign-in" className="font-medium text-brand-700 hover:underline">
          {t("signInTitle")}
        </Link>
      </p>
    </div>
  );
}
