"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  currentHubPath,
  hrefWithPatch,
  noteHubLocation,
  pathnameOf,
  readHubStack,
  writeHubStack,
  type HubStep,
  type ViewPatch,
} from "@/lib/hub-nav";

export function useViewQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const get = useCallback(
    (key: string) => searchParams.get(key) ?? "",
    [searchParams]
  );

  const commit = useCallback(
    (patch: ViewPatch, step: HubStep = "replace") => {
      const here = search ? `${pathname}?${search}` : pathname;
      const href = hrefWithPatch(pathname, search, patch);
      let stack = readHubStack();
      if (stack[stack.length - 1] !== here) {
        stack = noteHubLocation(stack, here, "auto");
      }
      if (href === here) {
        writeHubStack(stack);
        return;
      }
      const mode: HubStep = step === "push" ? "push" : "replace";
      stack = noteHubLocation(stack, href, mode);
      writeHubStack(stack);
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, search]
  );

  /** Undo an in-page detail when that open was its own history step. */
  const retreatSamePage = useCallback(() => {
    const here = currentHubPath();
    const stack = readHubStack();
    const prev = stack.length >= 2 ? stack[stack.length - 2] : "";
    if (
      stack[stack.length - 1] === here &&
      prev &&
      pathnameOf(prev) === pathnameOf(here)
    ) {
      router.back();
      return true;
    }
    return false;
  }, [router]);

  return { get, commit, retreatSamePage, pathname };
}

export function useListFilters() {
  const view = useViewQuery();
  return {
    q: view.get("q"),
    from: view.get("from"),
    to: view.get("to"),
    setQ: (value: string) => view.commit({ q: value || null }),
    setFrom: (value: string) => view.commit({ from: value || null }),
    setTo: (value: string) => view.commit({ to: value || null }),
    get: view.get,
    commit: view.commit,
    retreatSamePage: view.retreatSamePage,
  };
}
