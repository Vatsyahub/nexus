import { redirect } from "next/navigation";
import { loadOperationsAccess } from "../../load-access";
import { NewDispatchClient } from "./new-dispatch-client";

export default async function NewDispatchPage() {
  const access = await loadOperationsAccess();
  if (!access.canEdit) redirect("/operations");
  return <NewDispatchClient actorName={access.actorName} />;
}
