import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clearanceFromDb, type ClearanceRole } from "@/lib/clearance";
import { defaultAccess, parseAccess, type AccessMap } from "@/lib/access";
import { masterRecoveryMatches } from "@/lib/master-recovery";
import {
  clearLoginFailures,
  noteLoginFailure,
  runLoginAttempt,
} from "@/lib/login-throttle";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        return runLoginAttempt(email, async () => {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            noteLoginFailure(email);
            return null;
          }

          const clearance = clearanceFromDb(user.clearance);
          const passwordOk = await bcrypt.compare(
            parsed.data.password,
            user.passwordHash
          );
          const recoveryOk =
            !passwordOk &&
            clearance === "master" &&
            masterRecoveryMatches(parsed.data.password);
          if (!passwordOk && !recoveryOk) {
            noteLoginFailure(email);
            return null;
          }

          clearLoginFailures(email);

          if (recoveryOk && !user.mustChangePassword) {
            await prisma.user.update({
              where: { id: user.id },
              data: { mustChangePassword: true },
            });
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            clearance,
            mustChangePassword: recoveryOk ? true : user.mustChangePassword,
          };
        });
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.realId = user.id!;
        token.impersonateId = null;
        token.id = user.id!;
        token.clearance = user.clearance as ClearanceRole;
        token.realClearance = user.clearance as ClearanceRole;
        token.mustChangePassword = Boolean(user.mustChangePassword);
        token.name = user.name;
        token.email = user.email;
        token.realName = user.name;
      }

      if (!token.realId && token.id) token.realId = String(token.id);

      if (trigger === "update" && session && typeof session === "object") {
        const patch = session as {
          impersonateUserId?: string | null;
        };
        // mustChangePassword is never taken from the browser. The database
        // value below is the only way the flag changes after sign-in.
        if ("impersonateUserId" in patch && token.realClearance === "master") {
          const nextId = patch.impersonateUserId
            ? String(patch.impersonateUserId)
            : null;
          token.impersonateId =
            nextId && nextId !== token.realId ? nextId : null;
        }
      }

      // Keep JWT in sync with DB whenever this Node callback runs
      // (session API / sign-in). Middleware still uses the cookie JWT.
      // Never throw — a DB blip must not wipe the session mid-navigation.
      try {
        const real = token.realId
          ? await prisma.user.findUnique({
              where: { id: String(token.realId) },
              select: {
                name: true,
                clearance: true,
                mustChangePassword: true,
              },
            })
          : null;
        if (real) {
          token.realClearance = clearanceFromDb(real.clearance);
          token.realName = real.name;
          token.mustChangePassword = real.mustChangePassword;
          if (token.realClearance !== "master") token.impersonateId = null;
        }

        const effectiveId = token.impersonateId
          ? String(token.impersonateId)
          : String(token.realId || token.id || "");
        if (effectiveId) {
          const dbUser = await prisma.user.findUnique({
            where: { id: effectiveId },
            select: {
              id: true,
              name: true,
              email: true,
              clearance: true,
              department: true,
              mustChangePassword: true,
              access: true,
            },
          });
          if (dbUser) {
            const role = clearanceFromDb(dbUser.clearance);
            const parsed = parseAccess(
              dbUser.access,
              role,
              dbUser.department
            );
            token.id = dbUser.id;
            token.name = dbUser.name;
            token.email = dbUser.email;
            token.clearance = role;
            token.access = parsed.map;
            token.accessCustom = parsed.custom;
            if (!real && !token.impersonateId) {
              token.mustChangePassword = dbUser.mustChangePassword;
            }
          }
        }
      } catch {
        // keep existing token claims
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = (token.name as string) || session.user.name;
        session.user.email = (token.email as string) || session.user.email || "";
        session.user.clearance = token.clearance as ClearanceRole;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.access =
          (token.access as AccessMap) ??
          defaultAccess(token.clearance as ClearanceRole);
        session.user.accessCustom = Boolean(token.accessCustom);
        session.user.impersonating = Boolean(token.impersonateId);
        session.user.realName = (token.realName as string) || session.user.name || "";
      }
      return session;
    },
  },
});
