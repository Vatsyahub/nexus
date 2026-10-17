"use client";

import { useState } from "react";
import { DOORS, type AccessLevel, type AccessMap } from "@/lib/access";
import { saveUserAccess } from "@/app/actions/access";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";

const LEVELS: { id: AccessLevel; label: string }[] = [
  { id: "block", label: "Block" },
  { id: "view", label: "View" },
  { id: "edit", label: "Edit" },
];

export function AccessEditor({
  userId,
  initial,
}: {
  userId: string;
  initial: AccessMap;
}) {
  const [map, setMap] = useState<AccessMap>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const groups = [...new Set(DOORS.map((d) => d.group))];

  async function onSave() {
    setPending(true);
    setErr(null);
    setMsg(null);
    const result = await saveUserAccess(userId, map);
    setPending(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setMsg("Access saved. It applies the next time this person loads a page.");
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
      {...entryRootProps}
    >
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--fh-steel)]">
          Access
        </h2>
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
                    const disabled =
                      door.floor === "view" && level.id === "block";
                    return (
                      <button
                        key={level.id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setMap((m) => ({ ...m, [door.id]: level.id }))
                        }
                        className={
                          active
                            ? "rounded-md bg-[var(--fh-steel)] px-2.5 py-1 text-xs text-white"
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
