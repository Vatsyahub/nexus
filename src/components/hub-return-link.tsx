"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  currentHubPath,
  noteHubLocation,
  readHubStack,
  returnHref,
  writeHubStack,
} from "@/lib/hub-nav";

/** Back or Cancel that already means a list. Keeps that list's tab and filters. */
export function HubReturnLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        const target = returnHref(href);
        const here = currentHubPath();
        let stack = readHubStack();
        if (stack[stack.length - 1] !== here) {
          stack = noteHubLocation(stack, here, "auto");
        }
        const previous = stack.length >= 2 ? stack[stack.length - 2] : "";
        if (stack[stack.length - 1] === here && previous === target) {
          writeHubStack(stack.slice(0, -1));
          router.back();
          return;
        }
        writeHubStack(stack);
        router.push(target);
      }}
    >
      {children}
    </a>
  );
}
