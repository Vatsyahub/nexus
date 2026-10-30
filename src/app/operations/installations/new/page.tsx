import { redirect } from "next/navigation";
import { InstallationEditor } from "../../installation-editor";
import { loadOperationsAccess } from "../../load-access";

export default async function NewInstallationPage() {
  const access = await loadOperationsAccess();
  if (!access.canEdit) redirect("/operations?tab=installations");
  return (
    <InstallationEditor
      initialContractId=""
      canEdit
      actorName={access.actorName}
    />
  );
}
