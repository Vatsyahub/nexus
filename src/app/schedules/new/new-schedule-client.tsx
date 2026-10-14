"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isContractScheduleComplete, useFlowhubData } from "@/lib/store";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Intent = "add" | "edit";

export function NewScheduleClient() {
  const data = useFlowhubData();
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>("add");
  const [contractId, setContractId] = useState("");

  const contracts = useMemo(() => {
    const sorted = [...data.contracts].sort((a, b) =>
      a.projectNo.localeCompare(b.projectNo)
    );
    if (intent === "edit") {
      return sorted.filter((c) =>
        data.schedules.some((s) => s.contractId === c.id)
      );
    }
    return sorted;
  }, [data, intent]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/schedules"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Back to schedules
      </Link>

      <div className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--fh-steel)]">
          Add schedule
        </h1>

        <div className="space-y-1">
          <Label>Action</Label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "add", label: "Add / plan" },
                { id: "edit", label: "Edit existing" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setIntent(opt.id);
                  setContractId("");
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  intent === opt.id
                    ? "bg-[var(--fh-steel)] text-white"
                    : "bg-white text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)] hover:bg-[var(--fh-bg)]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <ContractTypeahead
          contracts={contracts}
          value={contractId}
          onChange={setContractId}
          placeholder="Type contract no. or name…"
          emptyMessage={
            intent === "edit"
              ? "No matching contracts with a schedule."
              : "No matching contracts."
          }
          optionSuffix={
            intent === "add"
              ? (c) =>
                  isContractScheduleComplete(c.id, data)
                    ? "schedule exists"
                    : null
              : undefined
          }
        />
        {intent === "edit" && contracts.length === 0 && (
          <p className="text-xs text-[var(--fh-muted)]">
            No schedules yet. Use Add / plan first.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-[var(--fh-steel)]"
            disabled={!contractId}
            onClick={() => {
              if (!contractId) return;
              const q = intent === "edit" ? "?mode=edit" : "?mode=plan";
              router.push(`/schedules/plan/${contractId}${q}`);
            }}
          >
            Continue
          </Button>
          <Link
            href="/schedules"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
