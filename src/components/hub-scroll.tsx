import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fills the hub main pane (one viewport). Title, search, and actions stay
 * put. Put the long list in HubDataScroll so only that region scrolls.
 */
export function HubPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-y-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Native right-hand scrollbar for a list, table, or card stack. */
export function HubDataScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-hub-data-scroll=""
      className={cn(
        "min-h-24 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]",
        className
      )}
    >
      {children}
    </div>
  );
}
