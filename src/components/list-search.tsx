"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatSearchQuery,
  parseSearchTokens,
} from "@/lib/list-search";

const DEFAULT_PLACEHOLDER = "Search any field…";

/** Top-of-page search for list/home screens — chip tokens AND together. */
export function ListSearchBar({
  value,
  onChange,
  className,
  placeholder = DEFAULT_PLACEHOLDER,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [tokens, setTokens] = useState<string[]>(() =>
    parseSearchTokens(value)
  );
  const [draft, setDraft] = useState("");
  const lastEmitted = useRef(value);

  function emit(nextTokens: string[], nextDraft: string) {
    const q = formatSearchQuery(
      nextDraft.trim() ? [...nextTokens, nextDraft.trim()] : nextTokens
    );
    lastEmitted.current = q;
    onChange(q);
  }

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setTokens(parseSearchTokens(value));
    setDraft("");
  }, [value]);

  function addFromRaw(raw: string) {
    const parts = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...tokens];
    for (const p of parts) {
      if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) {
        next.push(p);
      }
    }
    setTokens(next);
    setDraft("");
    emit(next, "");
  }

  function removeToken(index: number) {
    const next = tokens.filter((_, i) => i !== index);
    setTokens(next);
    emit(next, draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) addFromRaw(draft);
    } else if (e.key === "Backspace" && !draft && tokens.length) {
      e.preventDefault();
      removeToken(tokens.length - 1);
    }
  }

  return (
    <div className={cn("w-full max-w-xl", className)}>
      <div
        className={cn(
          "flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-white px-2 py-1",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        )}
      >
        <Search
          className="size-4 shrink-0 text-[var(--fh-muted)]"
          aria-hidden
        />
        {tokens.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--fh-bg)] px-1.5 py-0.5 text-xs text-[var(--fh-steel)]"
          >
            <span className="truncate">{t}</span>
            <button
              type="button"
              onClick={() => removeToken(i)}
              className="shrink-0 rounded p-0.5 text-[var(--fh-muted)] hover:bg-[var(--fh-line)] hover:text-[var(--fh-steel)]"
              aria-label={`Remove ${t}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          type="search"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) {
              addFromRaw(v);
              return;
            }
            setDraft(v);
            emit(tokens, v);
          }}
          onKeyDown={onKeyDown}
          placeholder={
            tokens.length ? "Add another term…" : placeholder
          }
          aria-label={placeholder}
          className="min-w-[7rem] flex-1 border-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="mt-1 text-[10px] leading-snug text-[var(--fh-muted)]">
        Enter or comma adds a term · all terms must match (AND)
      </p>
    </div>
  );
}
