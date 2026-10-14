import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { defaultAccess, levelForPath, type AccessMap } from "@/lib/access";
import { type ClearanceRole } from "@/lib/clearance";

/**
 * Absolute origin for redirects. Next's edge adapter parses Location with
 * `new NextURL(redirect)` — relative paths throw "Invalid URL".
 * Prefer forwarded tunnel host over the listen address, and keep whichever
 * host the browser used. The session cookie is host-specific, so swapping
 * 127.0.0.1 for localhost (or the reverse) drops the session.
 */
function publicOrigin(req: NextRequest): string {
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = req.headers.get("host")?.split(",")[0]?.trim();
  const host = xfHost || hostHeader || "127.0.0.1:3000";

  const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const tunnel =
    host.includes("lhr.life") ||
    host.includes("loca.lt") ||
    host.includes("trycloudflare.com");

  const isLoopback =
    host.startsWith("127.") ||
    host.startsWith("localhost") ||
    host.startsWith("0.0.0.0") ||
    host.startsWith("[::1]");

  const proto = tunnel ? "https" : xfProto || (isLoopback ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * NextURL rewrites a literal 127.x.x.x host to localhost and, when that
 * matches the normalized request, writes the localhost URL into Location.
 * Percent-encoding the dots leaves the real host in place; the dev server
 * then turns a same-listen-address Location into a relative redirect, so
 * the browser stays on 127.0.0.1 or localhost — whichever it already used.
 */
function shieldLoopbackLocation(absolute: string): string {
  return absolute.replace(
    /^(https?:\/\/)(127(?:\.\d{1,3}){3})(?=[:/?#]|$)/i,
    (_full, proto: string, ip: string) =>
      `${proto}${ip.replace(/\./g, "%2e")}`
  );
}

function redirectTo(req: NextRequest, path: string) {
  const absolute = new URL(path, publicOrigin(req)).toString();
  const location = shieldLoopbackLocation(absolute);
  // NextResponse.redirect() runs the URL through `new URL()`, which decodes
  // the shielded host back to 127.0.0.1 and lets the adapter rewrite it.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: location },
  });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLogin = pathname.startsWith("/login");
  const isAuthApi = pathname.startsWith("/api/auth");

  if (isAuthApi) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");

  // Cookie may be Secure-prefixed behind HTTPS tunnels even if this
  // request appears as http to Next (TLS terminated at the proxy).
  const session =
    (await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      secureCookie: true,
    })) ??
    (await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      secureCookie: false,
    }));

  const isLoggedIn = !!session;

  if (!isLoggedIn && !isLogin) {
    // API clients must get JSON 401 — not an HTML login redirect.
    // fetch() follows 307 to /login and then JSON.parse(HTML) blows up
    // hydrate, which left reports stuck empty / loading.
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return redirectTo(
      req,
      `/login?callbackUrl=${encodeURIComponent(pathname)}`
    );
  }

  if (isLoggedIn && isLogin) {
    return redirectTo(req, "/");
  }

  if (isLoggedIn && session) {
    const mustChange = Boolean(session.mustChangePassword);
    const onChangePassword = pathname.startsWith("/settings/password");
    if (mustChange && !onChangePassword) {
      return redirectTo(req, "/settings/password");
    }

    const clearance =
      (session.clearance as ClearanceRole | undefined) ?? "user";
    const access =
      (session.access as AccessMap | undefined) ?? defaultAccess(clearance);
    if (!isApi && levelForPath(pathname, access) === "block") {
      return redirectTo(req, "/");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
