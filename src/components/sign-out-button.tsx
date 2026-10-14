"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={className}
      onClick={async () => {
        await signOut({ redirect: false });
        window.location.assign("/login");
      }}
    >
      Sign out
    </Button>
  );
}
