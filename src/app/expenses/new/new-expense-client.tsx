"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addExpense, listExpenseCategories, useFlowhubData } from "@/lib/store";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

export function NewExpenseClient({ actorName }: { actorName: string }) {
  const data = useFlowhubData();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [err, setErr] = useState<string | null>(null);

  const categories = useMemo(() => listExpenseCategories(data), [data]);
  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
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

    const created = addExpense(
      draft.contractId,
      {
        amount: Number(draft.amount),
        date: draft.date,
        personPaid: draft.personPaid,
        reason: draft.reason,
        category: draft.category,
      },
      { by: actorName }
    );
    if (!created) {
      setErr("Could not save expense.");
      return;
    }
    const saved = await confirmWorkspaceSave();
    if (!saved) return;
    router.push("/expenses");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Add expense
        </h1>
        <Link
          href="/expenses"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to expenses
        </Link>
      </div>

      <section className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <form onSubmit={onSubmit} {...entryRootProps} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ContractTypeahead
              contracts={contracts}
              value={draft.contractId}
              onChange={(id) => setDraft((d) => ({ ...d, contractId: id }))}
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
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
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
              Add expense
            </Button>
            <Link
              href="/expenses"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Cancel
            </Link>
          </div>
        </form>
        {err && <p className="text-sm text-[var(--destructive)]">{err}</p>}
      </section>
    </div>
  );
}
