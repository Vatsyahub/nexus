import { NewPaymentClient } from "./new-payment-client";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.contractId;
  const contractId = typeof raw === "string" ? raw : "";
  return <NewPaymentClient defaultContractId={contractId} />;
}
