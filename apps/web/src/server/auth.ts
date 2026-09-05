import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "./db";
import {
  account,
  session,
  user as userTable,
  usersProfile,
  verification,
} from "@maqrivo/db";

/**
 * Email + password auth (ADR-0002). Sign-up is gated by an invite code from
 * the environment; every new user gets a profile row (locale, location).
 */
export const auth = betterAuth({
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: userTable, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Better Auth hard-codes a special rule for credential endpoints
  // (/sign-in*, /sign-up*, …) at 3 requests / 10 s / IP, overriding any
  // global max. That is below a shared-IP household or a serial E2E run —
  // a per-route custom rule is the only supported override. Brute force
  // stays impractical (scrypt hashing + invite-gated sign-up).
  rateLimit: {
    enabled: true,
    window: 10,
    max: 10,
    customRules: {
      "/sign-in/email": { window: 10, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        // The invite code is a transient gate field: validated here, never stored.
        const body = ctx.body as { inviteCode?: string } | undefined;
        const expected = process.env.SIGNUP_INVITE_CODE;
        if (!expected || body?.inviteCode !== expected) {
          throw new APIError("BAD_REQUEST", { message: "Invalid invite code" });
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          // Every user gets a Maqrivo profile row (locale, location).
          await db
            .insert(usersProfile)
            .values({ userId: newUser.id, locale: "fr" })
            .onConflictDoNothing({ target: usersProfile.userId });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
