"use client";

import { Suspense } from "react";
import { HubReturnLink } from "@/components/hub-return-link";
import { buttonVariants } from "@/components/ui/button";
import { HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";
import { CoreReportBody } from "./core-report-body";

export default function CoreReportPage() {
  return (
    <Suspense fallback={null}>
      <HubPage className="max-w-none">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
              Nexus Core
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
              Core report
            </h1>
          </div>
          <HubReturnLink
            href="/nexus-core"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to Nexus Core
          </HubReturnLink>
        </div>
        <CoreReportBody />
      </HubPage>
    </Suspense>
  );
}
