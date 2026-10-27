"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  currentHubPath,
  hubBackTarget,
  noteHubLocation,
  readHubStack,
  stackAfterPop,
  writeHubStack,
} from "@/lib/hub-nav";

function HubBackButtonInner() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const [canBack, setCanBack] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/login")) return;
    const next = noteHubLocation(readHubStack(), currentHubPath(), "auto");
    writeHubStack(next);
    setCanBack(next.length > 1);
  }, [pathname, search]);

  useEffect(() => {
    function onPop() {
      const next = stackAfterPop(readHubStack(), currentHubPath());
      writeHubStack(next);
      setCanBack(next.length > 1);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function goBack() {
    const current = currentHubPath();
    let stack = readHubStack();
    if (stack[stack.length - 1] !== current) {
      stack = noteHubLocation(stack, current, "auto");
    }
    const back = hubBackTarget(stack);
    if (!back) {
      writeHubStack(stack.length ? stack : [current]);
      setCanBack(false);
      router.push("/");
      return;
    }
    writeHubStack(back.stack);
    setCanBack(back.stack.length > 1);
    router.back();
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

/** Small right-edge tab — previous hub page, including its query. */
export function HubBackButton() {
  return (
    <Suspense fallback={null}>
      <HubBackButtonInner />
    </Suspense>
  );
}
