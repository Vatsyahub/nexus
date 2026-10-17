"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  clearAllExpenseHistory,
  clearDeletedExpenses,
  deleteExpense,
  flushWorkspace,
  listExpenseCategories,
  updateExpense,
  useFlowhubData,
} from "@/lib/store";
import { confirmAction } from "@/components/confirm-panel";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import type { ContractExpense } from "@/lib/types";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { ListSearchBar } from "@/components/list-search";
import {
  DeleteIconButton,
  EditIconButton,
  HistoryIconButton,
} from "@/components/icon-actions";
import { matchesAny } from "@/lib/list-search";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

type Draft = {
  contractId: string;
  amount: string;
  date: string;
  personPaid: string;
  reason: string;
  category: string;
};

const emptyDraft = (): Draft => ({
  contractId: "",
  amount: "",
  date: "",
  personPaid: "",
  reason: "",
  category: "",
});

export function ExpensesClient({
  canAdd = true,
  canEdit,
  canDelete,
  canViewHistory,
  actorName,
}: {
  canAdd?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewHistory: boolean;
  actorName: string;
}) {
  const data = useFlowhubData();
  const [q, setQ] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<{
    contractId: string;
    expenseId: string;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const categories = useMemo(() => listExpenseCategories(data), [data]);

  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );

  const rows = useMemo(() => {
    const out: {
      contractId: string;
      projectNo: string;
      projectName: string;
      expense: ContractExpense;
    }[] = [];
    for (const c of data.contracts) {
      for (const e of c.expenses ?? []) {
        if (!canViewHistory && e.deletedAt) continue;
        if (canViewHistory) {
          if (showDeleted && !e.deletedAt) continue;
          if (!showDeleted && e.deletedAt) continue;
        }
        if (
          q.trim() &&
          !matchesAny(q, [
            c.projectNo,
            c.projectName,
            c.city,
            e.personPaid,
            e.reason,
            e.category,
            String(e.amount),
            e.date,
            formatDisplayDate(e.date),
            e.createdBy,
          ])
        ) {
          continue;
        }
        out.push({
          contractId: c.id,
          projectNo: c.projectNo,
          projectName: c.projectName,
          expense: e,
        });
      }
    }
    return out.sort((a, b) => {
      const dd = b.expense.date.localeCompare(a.expense.date);
      if (dd) return dd;
      return b.expense.createdAt.localeCompare(a.expense.createdAt);
    });
  }, [data.contracts, showDeleted, q, canViewHistory]);

  const listedTotal = useMemo(
    () => rows.reduce((s, r) => s + r.expense.amount, 0),
    [rows]
  );

  const hasAnyHistory = useMemo(
    () =>
      data.contracts.some((c) =>
        (c.expenses ?? []).some((e) => (e.editHistory ?? []).length > 0)
      ),
    [data.contracts]
  );

  const deletedCount = useMemo(
    () =>
      data.contracts.reduce(
        (n, c) => n + (c.expenses ?? []).filter((e) => e.deletedAt).length,
        0
      ),
    [data.contracts]
  );

  function startEdit(contractId: string, e: ContractExpense) {
    setEditing({ contractId, expenseId: e.id });
    setDraft({
      contractId,
      amount: String(e.amount),
      date: e.date,
      personPaid: e.personPaid,
      reason: e.reason,
      category: e.category,
    });
    setErr(null);
    setMsg(null);
  }

  function cancelForm() {
    setEditing(null);
    setDraft(emptyDraft());
    setErr(null);
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    setMsg(null);
    if (!draft.contractId) {
      setErr("Select a contract.");
      return;
    }
    if (!(Number(draft.amount) > 0)) {
      setErr("Amount must be greater than 0.");
      return;
    }
    if (!draft.date) {
      setErr("Date is required.");
      return;
    }
    if (!draft.category.trim()) {
      setErr("Category is required (type a new one or pick from the list).");
      return;
    }

    if (!editing) return;
    if (!canEdit) {
      setErr("Only Manager and above can edit expenses.");
      return;
    }
    const result = updateExpense(
      editing.contractId,
      editing.expenseId,
      {
        amount: Number(draft.amount),
        date: draft.date,
        personPaid: draft.personPaid,
        reason: draft.reason,
        category: draft.category,
      },
      { by: actorName }
    );
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    const saved = await confirmWorkspaceSave();
    if (!saved) return;
    cancelForm();
  }

  async function onDelete(contractId: string, expenseId: string) {
    if (!canDelete) return;
    if (
      !(await confirmAction({
        message: "Delete this expense? It will stay in history.",
        action: "Delete",
      }))
    ) {
      return;
    }
    const result = deleteExpense(contractId, expenseId, { by: actorName });
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    await flushWorkspace();
    setMsg("Expense deleted.");
    if (editing?.expenseId === expenseId) cancelForm();
  }

  async function onClearAllHistory() {
    if (!canViewHistory) return;
    if (
      !(await confirmAction({
        message: "Clear edit history for every expense?",
        action: "Clear",
      }))
    ) {
      return;
    }
    const result = clearAllExpenseHistory();
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    await flushWorkspace();
    setMsg(`Cleared ${result.cleared} history entries.`);
    setHistoryFor(null);
  }

  async function onClearDeleted() {
    if (!canViewHistory) return;
    if (
      !(await confirmAction({
        message: "Permanently remove all deleted expenses? This cannot be undone.",
        action: "Remove",
      }))
    ) {
      return;
    }
    const result = clearDeletedExpenses();
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    await flushWorkspace();
    setMsg(`Cleared ${result.removed} deleted expenses.`);
    setShowDeleted(false);
    setHistoryFor(null);
  }

  return (
    <HubPage>
      <header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Expenses
          </h1>
        </div>
        {canAdd && (
          <Link
            href="/expenses/new"
            className={cn(
              buttonVariants(),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            Add expense
          </Link>
        )}
      </header>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[16rem] flex-1">
          <ListSearchBar
            value={q}
            onChange={setQ}
            placeholder="Search project, category, person, reason…"
          />
        </div>
        <p className="pb-0.5 text-sm tabular-nums text-[var(--fh-steel)]">
          Listed total{" "}
          <span className="font-semibold">{formatMoney(listedTotal)}</span>
        </p>
        {canViewHistory && (
          <>
            <label className="flex items-center gap-2 pb-0.5 text-sm text-[var(--fh-muted)]">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
              />
              Show deleted
              {deletedCount > 0 ? (
                <span className="tabular-nums opacity-80">({deletedCount})</span>
              ) : null}
            </label>
            {showDeleted && deletedCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void onClearDeleted()}
              >
                Clear deleted
              </Button>
            )}
            {hasAnyHistory && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onClearAllHistory()}
              >
                Clear history
              </Button>
            )}
          </>
        )}
      </div>

      <HubDataScroll className="space-y-4 overflow-x-auto">
      {editing && (
        <section className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
            Edit expense
          </h2>
          <form onSubmit={onSubmit} {...entryRootProps} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <ContractTypeahead
                contracts={contracts}
                value={draft.contractId}
                onChange={(id) =>
                  setDraft((d) => ({ ...d, contractId: id }))
                }
                disabled
                placeholder="Type contract no. or name…"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input
                id="exp-amount"
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, amount: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={draft.date}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, date: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-person">Person paid</Label>
              <Input
                id="exp-person"
                value={draft.personPaid}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, personPaid: e.target.value }))
                }
                placeholder="Name of payee"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-category">Category</Label>
              <Input
                id="exp-category"
                list="expense-category-options"
                value={draft.category}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, category: e.target.value }))
                }
                placeholder="Type or pick…"
                required
              />
              <datalist id="expense-category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="exp-reason">Reason</Label>
              <Input
                id="exp-reason"
                value={draft.reason}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, reason: e.target.value }))
                }
                placeholder="What was this for?"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" {...entrySaveProps} className="bg-[var(--fh-steel)]">
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={cancelForm}>
                Cancel
              </Button>
            </div>
          </form>
          {err && <p className="text-sm text-[var(--destructive)]">{err}</p>}
          {!canEdit && editing && (
            <p className="text-xs text-[var(--fh-muted)]">
              Editing needs Manager clearance or above.
            </p>
          )}
        </section>
      )}

      {msg && !editing && (
        <p className="text-sm text-[var(--fh-steel)]">{msg}</p>
      )}
      {err && !editing && (
        <p className="text-sm text-[var(--destructive)]">{err}</p>
      )}

      <section className="rounded-xl border border-[var(--fh-line)] bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Contract</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium">Person paid</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-[var(--fh-muted)]"
                >
                  {showDeleted
                    ? "No deleted expenses."
                    : "No expenses yet. Use Add expense."}
                </td>
              </tr>
            ) : (
              rows.map(({ contractId, projectNo, projectName, expense: e }) => (
                <tr
                  key={e.id}
                  className={cn(
                    e.deletedAt && "bg-[var(--fh-bg)]/60 text-[var(--fh-muted)]"
                  )}
                >
                  <td className="px-3 py-2 tabular-nums">
                    {formatDisplayDate(e.date)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/contracts/${contractId}`}
                      className="font-medium text-[var(--fh-steel)] hover:underline"
                    >
                      {projectNo}
                    </Link>
                    <p className="text-xs text-[var(--fh-muted)]">
                      {projectName}
                    </p>
                  </td>
                  <td className="px-3 py-2">{e.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatMoney(e.amount)}
                  </td>
                  <td className="px-3 py-2">{e.personPaid || "—"}</td>
                  <td className="px-3 py-2">
                    <p>{e.reason || "—"}</p>
                    {canViewHistory && e.deletedAt && (
                      <p className="text-[10px] uppercase tracking-wide text-[var(--destructive)]">
                        Deleted
                        {e.deletedBy ? ` by ${e.deletedBy}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {canEdit && !e.deletedAt && (
                        <EditIconButton
                          label="Edit expense"
                          onClick={() => startEdit(contractId, e)}
                        />
                      )}
                      {canDelete && !e.deletedAt && (
                        <DeleteIconButton
                          label="Delete expense"
                          onClick={() => void onDelete(contractId, e.id)}
                        />
                      )}
                      {canViewHistory && (e.editHistory?.length ?? 0) > 0 && (
                        <HistoryIconButton
                          label="Edit history"
                          onClick={() =>
                            setHistoryFor((id) =>
                              id === e.id ? null : e.id
                            )
                          }
                        />
                      )}
                    </div>
                    {canViewHistory && historyFor === e.id && (
                      <ul className="mt-2 space-y-1 text-xs text-[var(--fh-muted)]">
                        {e.editHistory.map((h) => (
                          <li key={h.id}>
                            {formatDisplayDateTime(h.at)} · {h.by} ·{" "}
                            {h.summary}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      </HubDataScroll>

      <p className="shrink-0 text-xs text-[var(--fh-muted)]">
        Totals on the contract detail page exclude deleted expenses.{" "}
        <Link
          href="/contracts"
          className={cn(buttonVariants({ variant: "link" }), "h-auto p-0 text-xs")}
        >
          Open contracts
        </Link>
      </p>
    </HubPage>
  );
}
