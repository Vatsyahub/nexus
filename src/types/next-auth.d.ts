import type { DefaultSession } from "next-auth";
import type { ClearanceRole } from "@/lib/clearance";
import type { AccessMap } from "@/lib/access";

declare module "next-auth" {
  interface User {
    clearance: ClearanceRole;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      clearance: ClearanceRole;
      mustChangePassword: boolean;
      access: AccessMap;
      accessCustom: boolean;
      impersonating: boolean;
      realName: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    realId?: string;
    impersonateId?: string | null;
    name?: string | null;
    email?: string | null;
    realName?: string | null;
    clearance: ClearanceRole;
    realClearance?: ClearanceRole;
    mustChangePassword: boolean;
    access?: AccessMap;
    accessCustom?: boolean;
  }
}
