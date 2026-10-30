import { Suspense } from "react";
import { loadOperationsAccess } from "./load-access";
import { OperationsClient } from "./operations-client";

export default async function OperationsPage() {
  const access = await loadOperationsAccess();
  return (
    <Suspense fallback={null}>
      <OperationsClient
        canAdd={access.canAdd}
        canEdit={access.canEdit}
        canDelete={access.canDelete}
        canViewHistory={access.canViewHistory}
        actorName={access.actorName}
      />
    </Suspense>
  );
}
