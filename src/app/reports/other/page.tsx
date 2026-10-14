import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ReportsLoading } from "../reports-shell";
import OtherReportsClient from "./other-client";

export default async function OtherReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Suspense fallback={<ReportsLoading />}>
      <OtherReportsClient />
    </Suspense>
  );
}
