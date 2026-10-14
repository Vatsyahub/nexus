"use client";

import { cn } from "@/lib/utils";

export function SegmentButton({
  active,
  onClick,
  label,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-md transition-colors",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        active
          ? "bg-white font-medium text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)]"
          : "text-[var(--fh-muted)] hover:text-[var(--fh-steel)]"
      )}
    >
      {label}
    </button>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "muted" | "warn" | "ok";
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide sm:text-[11px]",
        tone === "ok" && "bg-emerald-100 text-emerald-800",
        tone === "warn" && "bg-amber-100 text-amber-800",
        tone === "muted" && "bg-[var(--fh-bg)] text-[var(--fh-muted)]"
      )}
    >
      {label}
    </span>
  );
}

export function FormMessage({
  msg,
}: {
  msg: { kind: "ok" | "error"; text: string } | null;
}) {
  if (!msg) return null;
  return (
    <p
      role={msg.kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        msg.kind === "error"
          ? "border-[var(--destructive)]/40 bg-[var(--destructive)]/5 text-[var(--destructive)]"
          : "border-emerald-300 bg-emerald-50 text-emerald-800"
      )}
    >
      {msg.text}
    </p>
  );
}

export function todayIsoLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const qtyCell =
  "px-1 py-2 text-right align-top text-xs tabular-nums sm:px-1.5 sm:text-sm";
