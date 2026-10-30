"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { HubReturnLink } from "@/components/hub-return-link";
import { HubPage } from "@/components/hub-scroll";
import { buttonVariants } from "@/components/ui/button";
import { confirmAction } from "@/components/confirm-panel";
import { DeleteIconButton } from "@/components/icon-actions";
import { formatDisplayDate } from "@/lib/dates";
import { formatQty } from "@/lib/execution-reports";
import {
  deleteDeliveryChallan,
  flushWorkspace,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export function DcDetailClient({ canEdit }: { canEdit: boolean }) {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const [error, setError] = useState<string | null>(null);
  const dc = data.deliveryChallans.find((row) => row.id === id);
  const contract = data.contracts.find((row) => row.id === dc?.contractId);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--fh-muted)]">Loading workspace from server…</p>
    );
  }

  if (!dc) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Delivery challan not found.</p>
        <HubReturnLink
          href="/operations"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back
        </HubReturnLink>
      </div>
    );
  }

  const lines = dc.lines.map((line) => {
    const item = contract?.boq.find((row) => row.id === line.boqItemId);
    return {
      boqItemId: line.boqItemId,
      name: item?.name ?? "—",
      qty: line.qty,
    };
  });

  async function onDelete() {
    if (!dc) return;
    if (
      !(await confirmAction({
        message: `Delete DC ${dc.dcNo}? This cannot be undone.`,
        action: "Delete",
      }))
    ) {
      return;
    }
    const res = deleteDeliveryChallan(dc.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await flushWorkspace();
    router.push("/operations");
  }

  return (
    <HubPage className="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Delivery challan
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            {dc.dcNo || "DC"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <DeleteIconButton
              label={`Delete DC ${dc.dcNo}`}
              onClick={() => void onDelete()}
            />
          )}
          <HubReturnLink
            href="/operations"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back
          </HubReturnLink>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

      <section className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Project
          </p>
          {contract ? (
            <Link
              href={`/contracts/${contract.id}`}
              className="font-medium text-[var(--fh-steel)] hover:underline"
            >
              {contract.projectName}
            </Link>
          ) : (
            <p className="font-medium">Deleted contract</p>
          )}
          <p className="text-sm text-[var(--fh-muted)]">
            {contract?.projectNo ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            DC date
          </p>
          <p className="tabular-nums">{formatDisplayDate(dc.date)}</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--fh-line)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {lines.map((line) => (
              <tr key={line.boqItemId}>
                <td className="py-2">{line.name}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatQty(line.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </HubPage>
  );
}
