/**
 * Login checks that a JWT cookie cannot answer by itself.
 * The cookie keeps the last mustChangePassword value. Deleting a user,
 * or forcing a new password, only changes the user row.
 */

export const LOGIN_PAGE = "/login";
export const PASSWORD_PAGE = "/settings/password";
export const SIGNED_OUT_SAVE_MESSAGE = "You are signed out.";
export const PASSWORD_SAVE_MESSAGE = "Change your password before saving.";

/** User row for the person who signed in. Null means that row is gone. */
export type WorkspaceAccount = {
  mustChangePassword: boolean;
} | null;

export type WorkspaceSaveBlock = {
  status: 401 | 403;
  body:
    | { error: "Unauthorized"; signedOut: true }
    | { ok: false; error: string; redirect: typeof PASSWORD_PAGE };
};

/**
 * A workspace save is allowed only while this login's user row exists
 * and does not require a new password.
 */
export function blockWorkspaceSave(
  account: WorkspaceAccount
): WorkspaceSaveBlock | null {
  if (!account) {
    return {
      status: 401,
      body: { error: "Unauthorized", signedOut: true },
    };
  }
  if (account.mustChangePassword) {
    return {
      status: 403,
      body: {
        ok: false,
        error: PASSWORD_SAVE_MESSAGE,
        redirect: PASSWORD_PAGE,
      },
    };
  }
  return null;
}

export type ClosedAccountActions = {
  signOut: () => Promise<void>;
  /** Copy mustChangePassword from the user row into the session cookie. */
  refreshSession: () => Promise<void>;
};

/**
 * Read: a missing user is signed out. A forced password change can still load.
 * Write: a missing user is signed out and the save is refused.
 * A forced password change refreshes the cookie and the save is refused.
 */
export async function responseForClosedAccount(
  account: WorkspaceAccount,
  actions: ClosedAccountActions,
  mode: "read" | "write"
): Promise<WorkspaceSaveBlock | null> {
  const block = blockWorkspaceSave(account);
  if (!block) return null;
  if (block.status === 401) {
    try {
      await actions.signOut();
    } catch (err) {
      console.error("Could not clear the session cookie", err);
    }
    return block;
  }
  if (mode === "read") return null;
  try {
    await actions.refreshSession();
  } catch (err) {
    console.error("Could not refresh the session cookie", err);
  }
  return block;
}

/** Where the browser goes after a refused workspace save. */
export function workspaceSaveExit(body: {
  signedOut?: boolean;
  redirect?: string;
  error?: string;
} | null): { path: string; message: string } | null {
  if (body?.signedOut) {
    return { path: LOGIN_PAGE, message: SIGNED_OUT_SAVE_MESSAGE };
  }
  if (body?.redirect === PASSWORD_PAGE) {
    return {
      path: PASSWORD_PAGE,
      message: body.error || PASSWORD_SAVE_MESSAGE,
    };
  }
  return null;
}

export type JwtAccountLookup =
  | { status: "missing" }
  | { status: "found"; mustChangePassword: boolean }
  | { status: "error" };

/**
 * JWT callback result after the signed-in user row is read.
 * A missing row does not keep a token. A database error keeps the token
 * so a blip does not sign everyone out.
 */
export function jwtAfterUserLookup<T extends { mustChangePassword?: boolean }>(
  token: T,
  lookup: JwtAccountLookup
): T | null {
  if (lookup.status === "error") return token;
  if (lookup.status === "missing") return null;
  return { ...token, mustChangePassword: lookup.mustChangePassword };
}

/**
 * Id of the account that owns the cookie.
 * While Master is impersonating, realId is the login and id is the other person.
 */
export function loginIdFromToken(
  token: { id?: unknown; realId?: unknown } | null | undefined,
  sessionUserId?: string | null
): string {
  const realId = token?.realId ? String(token.realId) : "";
  if (realId) return realId;
  const id = token?.id ? String(token.id) : "";
  if (id) return id;
  return sessionUserId ? String(sessionUserId) : "";
}
