import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Auth.js sometimes emits absolute Location headers using the listen
 * address (0.0.0.0 / 127.0.0.1) when AUTH_URL is unset. Behind a public
 * tunnel that sends the browser off-host ("site can't be reached").
 * Rewrite those to relative paths so the browser stays on the tunnel URL.
 */
async function withRelativeRedirects(res: Response) {
  const location = res.headers.get("Location");
  if (!location) return res;

  try {
    const url = new URL(location, "http://local.invalid");
    const badHost =
      url.hostname === "0.0.0.0" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost";
    if (!badHost) return res;

    const headers = new Headers(res.headers);
    headers.set("Location", `${url.pathname}${url.search}`);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch {
    return res;
  }
}

export async function GET(req: NextRequest) {
  return withRelativeRedirects(await handlers.GET(req));
}

export async function POST(req: NextRequest) {
  return withRelativeRedirects(await handlers.POST(req));
}
