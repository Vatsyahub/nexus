"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function ImpersonateButton({ userId }: { userId: string }) {
  const { update, data } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (data?.user?.impersonating) return null;
  if (data?.user?.id === userId) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void update({ impersonateUserId: userId } as never).then(() => {
          router.push("/");
          router.refresh();
        });
      }}
    >
      Open as user
    </Button>
  );
}
