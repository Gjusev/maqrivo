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
