"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";

export function LoginForm({
  error,
  success,
}: {
  error: string | null;
  success?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setLocalError(null);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl: "/",
      });

      const failed =
        !result ||
        result.error ||
        result.ok === false ||
        result.status === 401 ||
        result.status === 403;

      if (failed) {
        setLocalError("Email or password does not match. Try again.");
        setPassword("");
        setPending(false);
        return;
      }

      window.location.assign("/");
    } catch {
      setLocalError("Email or password does not match. Try again.");
      setPassword("");
      setPending(false);
    }
  }

  const message = localError ?? error;

  return (
    <form
      onSubmit={onSubmit}
      className="nexus-force-light space-y-4 rounded-xl border border-white/10 bg-white/95 p-6 shadow-lg text-[#14232e]"
      noValidate
    >
      {success && !message && (
        <div
          className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
          role="status"
        >
          {success}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          aria-invalid={!!message}
          onChange={(e) => {
            setEmail(e.target.value);
            if (localError) setLocalError(null);
          }}
          className="bg-white"
        />
      </div>
      <PasswordField
        id="password"
        label="Password"
        autoComplete="current-password"
        required
        value={password}
        invalid={!!message}
        onChange={(v) => {
          setPassword(v);
          if (localError) setLocalError(null);
        }}
      />
      {message && (
        <div
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {message}
        </div>
      )}
      {forgot && (
        <p className="rounded-md border border-[var(--fh-line)] bg-[var(--fh-bg)] px-3 py-2 text-sm text-[var(--fh-ink)]">
          If you have forgotten your password, please contact the administrator
          to have it reset.
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-[var(--fh-steel)] underline-offset-2 hover:underline"
        onClick={() => setForgot(true)}
      >
        Forgot password
      </button>
    </form>
  );
}
