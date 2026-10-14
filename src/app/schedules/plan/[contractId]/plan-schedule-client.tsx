"use client";

import { SchedulePlanner } from "../../schedule-planner";
import { ScheduleContractView } from "../../schedule-contract-view";

export function PlanScheduleClient({
  contractId,
  mode,
  canEdit,
  actorName,
}: {
  contractId: string;
  mode: "plan" | "edit" | "view";
  canEdit: boolean;
  actorName: string;
}) {
  if (mode === "view") {
    return (
      <ScheduleContractView contractId={contractId} canEdit={canEdit} />
    );
  }

  return (
    <SchedulePlanner
      contractId={contractId}
      mode={mode}
      canEdit={canEdit}
      actorName={actorName}
    />
  );
}
