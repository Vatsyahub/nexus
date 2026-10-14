"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListSearchBar } from "@/components/list-search";
import { cn } from "@/lib/utils";

/** Compact From / To date inputs for report list toolbars. */
export function ListDateRangeInputs({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <div className="space-y-1">
        <Label className="text-xs text-[var(--fh-muted)]">From</Label>
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-[10.5rem] bg-white"
          aria-label="Date from"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-[var(--fh-muted)]">To</Label>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="w-[10.5rem] bg-white"
          aria-label="Date to"
        />
      </div>
    </div>
  );
}

/** Search bar with optional From/To date filters on the same wrapping row. */
export function ListSearchWithDateRange({
  value,
  onChange,
  placeholder,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  showDateRange = true,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  showDateRange?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-start gap-3",
        className
      )}
    >
      <ListSearchBar
        className="min-w-[12rem] max-w-xl flex-1"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      {showDateRange ? (
        <ListDateRangeInputs
          className="pt-0.5"
          from={dateFrom}
          to={dateTo}
          onFromChange={onDateFromChange}
          onToChange={onDateToChange}
        />
      ) : null}
    </div>
  );
}
