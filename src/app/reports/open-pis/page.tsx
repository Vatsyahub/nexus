"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReportsLoading } from "../reports-shell";

/** Legacy route — Proformas now live on Invoices and Outstandings. */
export default function OpenPisRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/reports/outstanding?tab=proformas");
  }, [router]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ReportsLoading />
    </div>
  );
}
