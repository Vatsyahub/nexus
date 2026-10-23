"use client";

import { useState } from "react";
import {
  DOORS,
  applyBulkAccess,
  doorChoiceDisabled,
  presentAccess,
  type AccessChoiceContext,
  type AccessLevel,
  type AccessMap,
} from "@/lib/access";
import type { ClearanceRole } from "@/lib/clearance";
import { saveUserAccess } from "@/app/actions/access";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";

const LEVELS: { id: AccessLevel; label: string }[] = [
  { id: "block", label: "Block" },
  { id: "view", label: "View" },
  { id: "edit", label: "Edit" },
];

const BULK: { id: AccessLevel; label: string }[] = [
  { id: "view", label: "View all" },
  { id: "edit", label: "Edit all" },
  { id: "block", label: "Block all" },
];

export function AccessEditor({
  userId,
  initial,
  role,
  masterCount,
  otherMastersOnEdit,
}: {
  userId: string;
  initial: AccessMap;
  role: ClearanceRole;
  masterCount: number;
  otherMastersOnEdit: number;
}) {
  const [map, setMap] = useState<AccessMap>(() =>
    presentAccess(initial, { role, masterCount })
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const groups = [...new Set(DOORS.map((d) => d.group))];
  const choice: AccessChoiceContext = {
    role,
    masterCount,
    storedUsers: initial.users,
    otherMastersOnEdit,
  };

  async function onSave() {
    setPending(true);
    setErr(null);
    setMsg(null);
    try {
      const result = await saveUserAccess(userId, map);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      setMsg("Access saved. It applies the next time this person loads a page.");
    } catch {
      setErr("Could not save access. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
      {...entryRootProps}
    >
      <div className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--fh-steel)]">
          Access
        </h2>
        <div className="flex flex-wrap gap-2">
          {BULK.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() =>
                setMap((current) => applyBulkAccess(current, level.id))
              }
              className="rounded-md border border-[var(--fh-line)] px-2.5 py-1 text-xs text-[var(--fh-ink)]"
            >
              {level.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--fh-muted)]">
          View all, Edit all, and Block all leave Home, Settings, User
          management, and Nexus Core unchanged.
        </p>
      </div>
      {groups.map((group) => (
        <div key={group} className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            {group}
          </p>
          <ul className="divide-y divide-[var(--fh-line)] rounded-lg border border-[var(--fh-line)]">
            {DOORS.filter((d) => d.group === group).map((door) => (
              <li
                key={door.id}
                className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-[var(--fh-ink)]">{door.label}</span>
                <div className="flex gap-1">
                  {LEVELS.map((level) => {
                    const active = map[door.id] === level.id;
                    const disabled = doorChoiceDisabled(
                      door.id,
                      level.id,
                      choice
                    );
                    const title = !disabled
                      ? undefined
                      : door.id === "users"
                        ? role === "master"
                          ? "At least one Master must keep User management on Edit."
                          : "User management stays on Block for anyone who is not Master."
                        : door.id === "nexus_core"
                          ? "Nexus Core stays on Block unless this person is Master or Director."
                          : door.floor === "view"
                            ? `${door.label} cannot be Block.`
                            : undefined;
                    return (
                      <button
                        key={level.id}
                        type="button"
                        disabled={disabled}
                        title={title}
                        onClick={() =>
                          setMap((current) => ({
                            ...current,
                            [door.id]: level.id,
                          }))
                        }
                        className={
                          active
                            ? "rounded-md bg-[var(--fh-steel)] px-2.5 py-1 text-xs text-white disabled:opacity-40"
                            : "rounded-md border border-[var(--fh-line)] px-2.5 py-1 text-xs text-[var(--fh-muted)] disabled:opacity-40"
                        }
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Button
        type="button"
        {...entrySaveProps}
        className="bg-[var(--fh-steel)]"
        disabled={pending}
        onClick={() => void onSave()}
      >
        {pending ? "Saving…" : "Save access"}
      </Button>
      {err && <p className="text-sm text-[var(--destructive)]">{err}</p>}
      {msg && <p className="text-sm text-[var(--fh-steel)]">{msg}</p>}
    </section>
  );
}
