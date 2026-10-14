"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  applyCascadeProposals,
  deleteSchedule,
  flushWorkspace,
  markScheduleDone,
  updateSchedule,
  useFlowhubData,
  type CascadeProposal,
} from "@/lib/store";
import { confirmAction } from "@/components/confirm-panel";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import {
  SCHEDULE_KIND_LABELS,
  isScheduleDateNa,
  type ScheduleKind,
} from "@/lib/types";
import {
  formatDisplayDate,
  formatScheduleDateRange,
} from "@/lib/dates";
import { ScheduleDateField } from "@/components/schedule-date-field";
import { defaultAccess } from "@/lib/access";
import { canEditSchedules } from "@/lib/schedule-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DeleteIconButton,
  EditIconButton,
  EditIconLink,
} from "@/components/icon-actions";
import { cn } from "@/lib/utils";

export default function ScheduleDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { data: session } = useSession();
  const data = useFlowhubData();
  const line = data.schedules.find((s) => s.id === id);
  const contract = data.contracts.find((c) => c.id === line?.contractId);

  const access =
    session?.user?.access ??
    defaultAccess(session?.user?.clearance ?? "user");
  const canEdit = canEditSchedules({
    clearance: session?.user?.clearance,
    accessLevel: access.schedules,
  });
  const actorName =
    session?.user?.name?.trim() || session?.user?.email || "User";
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<ScheduleKind>("supply");
  const [boqItemId, setBoqItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [committed, setCommitted] = useState(false);
  const [cascade, setCascade] = useState<CascadeProposal[] | null>(null);
  const [completionDate, setCompletionDate] = useState("");

  const item = useMemo(() => {
    if (!line?.boqItemId || !contract) return null;
    return contract.boq.find((b) => b.id === line.boqItemId) ?? null;
  }, [line, contract]);

  if (!line || !contract) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Schedule line not found.</p>
        <Link
          href="/schedules"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back
        </Link>
      </div>
    );
  }

  const c = contract;
  const scheduleLine = line;

  function startEdit() {
    setKind(scheduleLine.kind);
    setBoqItemId(scheduleLine.boqItemId ?? "");
    setQuantity(scheduleLine.quantity != null ? String(scheduleLine.quantity) : "");
    setStartDate(scheduleLine.startDate);
    setEndDate(scheduleLine.endDate);
    setCommitted(scheduleLine.committed);
    setEditing(true);
    setMsg(null);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!canEdit) {
      setMsg("This login cannot change schedules.");
      return;
    }
    const itemKinds = kind === "supply" || kind === "installation";
    const end = itemKinds ? endDate || startDate : startDate;
    if (!startDate) {
      setMsg("Date is required (or set NA).");
      return;
    }
    if (
      !isScheduleDateNa(startDate) &&
      !isScheduleDateNa(end) &&
      end < startDate
    ) {
      setMsg("End date cannot be before start date.");
      return;
    }
    if (itemKinds && (!(Number(quantity) > 0) || !boqItemId)) {
      setMsg("BOQ item and quantity are required for supply / installation.");
      return;
    }
    if (
      kind === "handover" &&
      !isScheduleDateNa(startDate) &&
      c.closureDate &&
      startDate > c.closureDate
    ) {
      const ok = await confirmAction({
        message: `Handover date is after the contract closure date (${c.closureDate}). Save anyway? The closure date will show in red on the contracts list.`,
        action: "Save anyway",
      });
      if (!ok) return;
    }
    const updated = updateSchedule(
      id,
      {
        kind,
        boqItemId: itemKinds ? boqItemId : null,
        quantity: itemKinds ? Number(quantity) : null,
        startDate,
        endDate: end,
        committed,
      },
      { by: actorName }
    );
    if (!updated.ok) {
      setMsg(updated.error);
      return;
    }
    const saved = await confirmWorkspaceSave();
    if (!saved) return;
    setEditing(false);
    setMsg(null);
    if (updated.cascade?.length) {
      setCascade(updated.cascade);
    }
  }

  async function onDelete() {
    if (!canEdit) return;
    if (
      !(await confirmAction({
        message: "Delete this schedule line?",
        action: "Delete",
      }))
    ) {
      return;
    }
    deleteSchedule(id, { by: actorName });
    await flushWorkspace();
    router.push("/schedules");
  }

  async function onMarkDoneWithDate() {
    if (!canEdit) return;
    const result = markScheduleDone(id, {
      by: actorName,
      done: true,
      completedDate: completionDate,
    });
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    await flushWorkspace();
    setMsg(`Marked done on ${formatDisplayDate(completionDate)}.`);
  }

  async function onClearDone() {
    if (!canEdit) return;
    const result = markScheduleDone(id, {
      by: actorName,
      done: false,
    });
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    await flushWorkspace();
    setCompletionDate("");
    setMsg("Cleared done.");
  }

  async function confirmCascade() {
    if (!cascade?.length) return;
    const result = applyCascadeProposals(cascade, {
      by: actorName,
      contractId: line!.contractId,
    });
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    await flushWorkspace();
    setCascade(null);
    setMsg("Cascade confirmed.");
  }

  const itemKinds =
    (editing ? kind : line.kind) === "supply" ||
    (editing ? kind : line.kind) === "installation";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/schedules"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to schedules
        </Link>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {line.committed ? "Committed" : "Uncommitted"}
          </Badge>
          {line.done ? (
            <Badge className="bg-[var(--fh-ok)]/15 text-[var(--fh-ok)]">
              Done
              {line.doneAt
                ? ` · completed ${formatDisplayDate(line.doneAt)}`
                : ""}
            </Badge>
          ) : (
            <Badge variant="secondary">Planned</Badge>
          )}
          {!editing && (
            <Link
              href={`/schedules/plan/${line.contractId}?mode=view`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              View full schedule
            </Link>
          )}
          {canEdit && !editing && (
            <>
              <EditIconLink
                href={`/schedules/plan/${line.contractId}?mode=edit`}
                label="Edit schedule"
              />
              <EditIconButton label="Edit line" onClick={startEdit} />
              <DeleteIconButton
                label="Delete line"
                onClick={() => void onDelete()}
              />
            </>
          )}
        </div>
      </div>

      {msg && (
        <p className="rounded-md border border-[var(--fh-line)] bg-white px-3 py-2 text-sm">
          {msg}
        </p>
      )}

      {canEdit && (
        <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
            Record completion
          </h2>
          {line.done ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm">
                Completed on{" "}
                <strong>{formatDisplayDate(line.doneAt)}</strong>
                {line.doneBy ? ` · ${line.doneBy}` : ""}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onClearDone()}
              >
                Clear done
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="completionDate">Completion date</Label>
                <Input
                  id="completionDate"
                  type="date"
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-[var(--fh-steel)]"
                disabled={!completionDate}
                onClick={() => void onMarkDoneWithDate()}
              >
                Mark done
              </Button>
            </div>
          )}
        </section>
      )}

      <article className="rounded-xl border border-[var(--fh-line)] bg-white p-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--fh-steel)]">
          {SCHEDULE_KIND_LABELS[line.kind]}
        </h1>
        <p className="mt-1 text-sm text-[var(--fh-muted)]">
          {contract.projectNo} · {contract.projectName}
        </p>

        {!editing ? (
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                Dates
              </dt>
              <dd className="mt-1 tabular-nums font-medium">
                {formatScheduleDateRange(line.startDate, line.endDate)}
                {isScheduleDateNa(line.startDate) ? (
                  <span className="mt-0.5 block text-xs font-normal text-[var(--fh-muted)]">
                    Not required / not applicable
                  </span>
                ) : null}
              </dd>
            </div>
            {item && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                  BOQ item
                </dt>
                <dd className="mt-1 font-medium">{item.name}</dd>
              </div>
            )}
            {line.quantity != null && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                  Quantity
                </dt>
                <dd className="mt-1 tabular-nums font-medium">
                  {line.quantity}
                  {item ? ` ${item.unit}` : ""}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                Baseline
              </dt>
              <dd className="mt-1 tabular-nums text-[var(--fh-muted)]">
                {line.baselineStartDate === line.baselineEndDate
                  ? line.baselineStartDate
                  : formatScheduleDateRange(
                      line.baselineStartDate,
                      line.baselineEndDate
                    )}
              </dd>
            </div>
          </dl>
        ) : (
          <form onSubmit={onSave} className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Type</Label>
                <select
                  className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ScheduleKind)}
                >
                  {(Object.keys(SCHEDULE_KIND_LABELS) as ScheduleKind[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {SCHEDULE_KIND_LABELS[k]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Committed</Label>
                <select
                  className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
                  value={committed ? "yes" : "no"}
                  onChange={(e) => setCommitted(e.target.value === "yes")}
                >
                  <option value="no">Uncommitted</option>
                  <option value="yes">Committed</option>
                </select>
              </div>
              {itemKinds && (
                <>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>BOQ item</Label>
                    <select
                      className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
                      value={boqItemId}
                      onChange={(e) => setBoqItemId(e.target.value)}
                      required
                    >
                      <option value="">Select…</option>
                      {contract.boq.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                  </div>
                  <ScheduleDateField
                    label="Start"
                    value={startDate}
                    onChange={(v) => {
                      setStartDate(v);
                      if (isScheduleDateNa(v)) setEndDate(v);
                    }}
                  />
                  <ScheduleDateField
                    label="End"
                    value={endDate}
                    onChange={setEndDate}
                    disabled={isScheduleDateNa(startDate)}
                  />
                </>
              )}
              {!itemKinds && (
                <ScheduleDateField
                  label="Date"
                  value={startDate}
                  onChange={(v) => {
                    setStartDate(v);
                    setEndDate(v);
                  }}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="bg-[var(--fh-steel)]">
                Save changes
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </article>

      {cascade && cascade.length > 0 && (
        <div className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
            Confirm cascaded dates
          </h2>
          <ul className="mt-4 space-y-3">
            {cascade.map((p, i) => (
              <li
                key={p.scheduleId}
                className="rounded-lg border border-[var(--fh-line)] p-3 text-sm"
              >
                <p className="font-medium">{p.label}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input
                    type="date"
                    value={p.startDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCascade((prev) =>
                        prev
                          ? prev.map((row, j) =>
                              j === i ? { ...row, startDate: v } : row
                            )
                          : prev
                      );
                    }}
                  />
                  <Input
                    type="date"
                    value={p.endDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCascade((prev) =>
                        prev
                          ? prev.map((row, j) =>
                              j === i ? { ...row, endDate: v } : row
                            )
                          : prev
                      );
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              className="bg-[var(--fh-steel)]"
              onClick={() => void confirmCascade()}
            >
              Confirm cascade
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCascade(null)}>
              Skip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
