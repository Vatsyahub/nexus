"use client";

import { SCHEDULE_DATE_NA, isScheduleDateNa } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Date input with an NA option (not required / not applicable). */
export function ScheduleDateField({
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const na = isScheduleDateNa(value);
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1.5">
        {na ? (
          <div className="flex h-8 flex-1 items-center rounded-lg border border-input bg-[var(--fh-bg)] px-2 text-sm font-medium text-[var(--fh-muted)]">
            NA
          </div>
        ) : (
          <Input
            type="date"
            className="flex-1"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <Button
          type="button"
          size="sm"
          variant={na ? "default" : "outline"}
          className={cn(
            "shrink-0 px-2",
            na && "bg-[var(--fh-steel)] text-white"
          )}
          disabled={disabled}
          onClick={() => onChange(na ? "" : SCHEDULE_DATE_NA)}
          title={
            na
              ? "Clear NA and enter a date"
              : "Mark not required / not applicable"
          }
        >
          NA
        </Button>
      </div>
    </div>
  );
}
