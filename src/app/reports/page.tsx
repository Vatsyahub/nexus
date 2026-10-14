"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useWorkspaceReady } from "@/lib/store";
import { defaultAccess, reportDoorForHref } from "@/lib/access";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { LIVE_REPORTS, ReportsLoading } from "./reports-shell";

export default function ReportsHomePage() {
  const ready = useWorkspaceReady();
  const { data } = useSession();
  const access =
    data?.user?.access ?? defaultAccess(data?.user?.clearance ?? "user");
  const cards = LIVE_REPORTS.filter((r) => {
    const door = reportDoorForHref(r.href);
    if (!door) return true;
    return access[door] !== "block";
  });

  return (
    <HubPage className="max-w-5xl">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Reports
        </h1>
      </div>

      {!ready ? (
        <ReportsLoading />
      ) : (
        <HubDataScroll>
        <section className="grid gap-3 sm:grid-cols-2">
          {cards.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-xl border border-[var(--fh-line)] bg-white p-5 transition hover:border-[var(--fh-steel)]/40"
            >
              <p className="font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
                {r.label}
              </p>
            </Link>
          ))}
        </section>
        </HubDataScroll>
      )}
    </HubPage>
  );
}
