"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;

/**
 * Sign-up goes through a plain fetch because the invite code is a transient
 * gate field (validated in the server hook, never persisted) that the typed
 * client does not model. The session cookie is set by the same response.
 */
export async function signUpWithInvite(input: {
  name: string;
  email: string;
  password: string;
  inviteCode: string;
}): Promise<{ ok: true } | { ok: false; error: "invalidInviteCode" | "emailInUse" | "unknown" }> {
  const res = await fetch("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  if (body?.code === "USER_ALREADY_EXISTS" || res.status === 409) return { ok: false, error: "emailInUse" };
  if (res.status === 400) return { ok: false, error: "invalidInviteCode" };
  return { ok: false, error: "unknown" };
}

