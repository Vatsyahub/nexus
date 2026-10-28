"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import {
  flushWorkspace,
  clearReadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsForUser,
  pruneExpiredNotifications,
  resolveNotificationHref,
  useFlowhubData,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Strip legacy " — ProjectNo · Name" suffix from older notification bodies. */
function taskLabelFromBody(body: string): string {
  const cut = body.indexOf(" — ");
  return cut === -1 ? body : body.slice(0, cut).trim() || body;
}

type Me = {
  id: string;
  name: string | null;
  department: string | null;
  secondDepartment?: string | null;
  clearance: string | null;
};

export function NotificationBell({
  variant = "light",
}: {
  /** light = white header; dark = steel sidebar */
  variant?: "light" | "dark";
}) {
  const { data: session } = useSession();
  const data = useFlowhubData();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setMe(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const json = (await res.json()) as Me;
        if (!cancelled) setMe(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!open) return;
    // Opening the panel drops anything past the one-day lifetime.
    if (pruneExpiredNotifications()) {
      void flushWorkspace();
    }
    function place() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 16);
      const maxH = Math.min(384, window.innerHeight * 0.7);
      let left = r.right + 8;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, r.left - width - 8);
      }
      let top = r.top;
      if (top + maxH > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - maxH - 8);
      }
      setPanelPos({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const user = useMemo(() => {
    if (!session?.user?.id) return null;
    return {
      id: session.user.id,
      name: me?.name ?? session.user.name ?? null,
      department: me?.department ?? null,
      secondDepartment: me?.secondDepartment ?? null,
      clearance: me?.clearance ?? session.user.clearance ?? null,
    };
  }, [session?.user?.id, session?.user?.name, session?.user?.clearance, me]);

  const mine = useMemo(
    () => (user ? notificationsForUser(user, data) : []),
    [user, data]
  );
  const unread = mine.filter(
    (n) => user && !n.readByUserIds.includes(user.id)
  ).length;
  const clearable =
    !!user && mine.some((n) => n.readByUserIds.includes(user.id));

  if (!user) return null;

  async function onOpenItem(id: string) {
    markNotificationRead(id, user!.id);
    await flushWorkspace();
    setOpen(false);
  }

  async function onMarkAll() {
    markAllNotificationsRead(user!.id, user!);
    await flushWorkspace();
  }

  async function onClear() {
    clearReadNotifications(user!);
    await flushWorkspace();
  }

  const panel =
    open &&
    panelPos &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[80] cursor-default"
          aria-label="Close notifications"
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-label="Notifications"
          style={{ top: panelPos.top, left: panelPos.left }}
          className="fixed z-[90] max-h-[min(24rem,70vh)] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--fh-line)] bg-white text-[var(--fh-ink)] shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--fh-line)] px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--fh-steel)]">
                Notifications
              </p>
              <p className="text-[10px] text-[var(--fh-muted)]">
                Unread stay until opened; then 24 hours
              </p>
            </div>
            {(clearable || unread > 0) && (
              <div className="flex shrink-0 items-center gap-2">
                {clearable && (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-[var(--fh-muted)] hover:text-[var(--fh-steel)]"
                    onClick={() => void onClear()}
                  >
                    Clear
                  </button>
                )}
                {unread > 0 && (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-[var(--fh-muted)] hover:text-[var(--fh-steel)]"
                    onClick={() => void onMarkAll()}
                  >
                    Mark all read
                  </button>
                )}
              </div>
            )}
          </div>
          <ul className="max-h-[min(20rem,60vh)] overflow-y-auto">
            {mine.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-[var(--fh-muted)]">
                No jobs for you yet.
              </li>
            ) : (
              mine.slice(0, 40).map((n) => {
                const isUnread = !n.readByUserIds.includes(user.id);
                const href = resolveNotificationHref(n, data);
                const task = n.taskId
                  ? data.tasks.find((t) => t.id === n.taskId)
                  : null;
                const contract = n.contractId
                  ? data.contracts.find((c) => c.id === n.contractId)
                  : null;
                const alertLine = task?.title || taskLabelFromBody(n.body);
                const contractLine = contract
                  ? `${contract.projectNo} · ${contract.projectName}`
                  : null;
                return (
                  <li
                    key={n.id}
                    className="border-b border-[var(--fh-line)] last:border-0"
                  >
                    <Link
                      href={href}
                      onClick={() => void onOpenItem(n.id)}
                      className={cn(
                        "block px-3 py-2.5 text-sm transition-colors hover:bg-[var(--fh-bg)]",
                        isUnread && "bg-[var(--fh-accent)]/10"
                      )}
                    >
                      <p className="font-medium text-[var(--fh-steel)]">
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--fh-ink)]">
                        {alertLine}
                      </p>
                      {contractLine && (
                        <p className="mt-0.5 text-xs text-[var(--fh-muted)]">
                          {contractLine}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </>,
      document.body
    );

  return (
    <div className="relative">
      <Button
        ref={btnRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={
          unread > 0 ? `${unread} unread notifications` : "Notifications"
        }
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative size-8",
          variant === "dark"
            ? "text-white/80 hover:bg-white/10 hover:text-white"
            : "text-[var(--fh-steel)] hover:bg-[var(--fh-bg)]"
        )}
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--fh-accent)] px-1 text-[10px] font-semibold text-[var(--fh-ink)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      {panel}
    </div>
  );
}
