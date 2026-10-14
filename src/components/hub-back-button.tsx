"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const STORAGE_KEY = "nexus-hub-nav-stack";
const MAX_STACK = 50;

function currentHubPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(stack.slice(-MAX_STACK))
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Small right-edge tab — previous hub page. */
export function HubBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [canBack, setCanBack] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/login")) return;
    const current = currentHubPath();
    const stack = readStack();
    if (stack[stack.length - 1] !== current) {
      stack.push(current);
      writeStack(stack);
    }
    setCanBack(stack.length > 1);
  }, [pathname]);

  function goBack() {
    const stack = readStack();
    if (stack.length < 2) {
      router.push("/");
      return;
    }
    stack.pop();
    const prev = stack[stack.length - 1] || "/";
    writeStack(stack);
    setCanBack(stack.length > 1);
    router.push(prev);
  }

  if (pathname.startsWith("/login") || pathname === "/") return null;

  return (
    <button
      type="button"
      onClick={goBack}
      disabled={!canBack}
      aria-label="Go back to previous page"
      title={canBack ? "Previous page" : "No previous page"}
      className="fixed right-0 top-1/2 z-40 flex h-11 w-7 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[var(--fh-line)] bg-white text-[var(--fh-steel)] shadow-sm transition-colors hover:bg-[var(--fh-bg)] disabled:pointer-events-none disabled:opacity-25"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
    </button>
  );
}
