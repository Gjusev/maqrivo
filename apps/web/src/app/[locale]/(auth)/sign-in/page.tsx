"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const result = await signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (result.error) {
      // Rate limiting (HTTP 429) is not a credentials problem; say so.
      const status = (result.error as { status?: number }).status;
      setError(status === 429 ? t("tooManyAttempts") : t("invalidCredentials"));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold tracking-tight text-zinc-900">{t("signInTitle")}</h1>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <div>
          <label htmlFor="email">{t("email")}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password">{t("password")}</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error ? <p className="field-error">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {t("signIn")}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        {t("noAccount")}{" "}
        <Link href="/sign-up" className="font-medium text-brand-700 hover:underline">
          {t("signUpTitle")}
        </Link>
      </p>
      <p className="mt-3 text-xs text-zinc-400">{t("demoHint")}</p>
    </div>
  );
}
