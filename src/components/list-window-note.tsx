"use client";

import {
  listWindowNote,
  type ListWindowOrder,
} from "@/lib/list-window";
import { cn } from "@/lib/utils";

/** “Latest 100” or “Oldest 100” when that open list was cut. */
export function ListWindowNote({
  capped,
  order,
  className,
}: {
  capped: boolean;
  order: ListWindowOrder;
  className?: string;
}) {
  const note = listWindowNote(capped, order);
  if (!note) return null;
  return (
    <p className={cn("text-xs text-[var(--fh-muted)]", className)}>{note}</p>
  );
}
