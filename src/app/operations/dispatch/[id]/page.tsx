import { loadOperationsAccess } from "../../load-access";
import { DcDetailClient } from "./dc-detail-client";

export default async function DcDetailPage() {
  const access = await loadOperationsAccess();
  return <DcDetailClient canEdit={access.canEdit} />;
}
