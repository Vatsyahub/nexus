import type { NextAuthConfig } from "next-auth";
import type { ClearanceRole } from "@/lib/clearance";

/**
 * Edge-safe Auth.js config (no Prisma). Used by middleware.
 * Credentials provider + DB live in auth.ts (Node).
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    // Always authorize in the edge callback — Auth.js's built-in
    // unauthenticated redirect builds an absolute URL and throws
    // "Invalid URL" behind tunnels / when AUTH_URL is unset.
    // Real gating lives in middleware.ts (relative / public-host redirects).
    authorized() {
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.clearance = user.clearance as ClearanceRole;
        token.mustChangePassword = Boolean(user.mustChangePassword);
      }
      if (trigger === "update" && session?.mustChangePassword === false) {
        token.mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.clearance = token.clearance as ClearanceRole;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
