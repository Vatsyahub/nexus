"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  invalid,
}: {
  id: string;
  name?: string;
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name ?? id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className="bg-white pr-10"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--fh-muted)] hover:text-[var(--fh-steel)]"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
