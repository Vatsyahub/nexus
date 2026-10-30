import { InstallationEditor } from "../../installation-editor";
import { loadOperationsAccess } from "../../load-access";

export default async function InstallationContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  const access = await loadOperationsAccess();
  return (
    <InstallationEditor
      initialContractId={contractId}
      canEdit={access.canEdit}
      actorName={access.actorName}
    />
  );
}
