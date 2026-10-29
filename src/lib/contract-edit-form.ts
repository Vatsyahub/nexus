/**
 * Boxes on the contract edit page.
 * Filled once from the saved contract when that page opens.
 * A workspace refresh builds a new contract object with the same id.
 * That object must not be copied back over these boxes.
 */

import { gstEditValue } from "@/lib/contract-gst";

export type ContractEditSource = {
  id: string;
  projectName: string;
  projectNo: string;
  orderNos: string;
  orderDate: string;
  closureDate: string;
  orderValue: number;
  gstApplicable: boolean;
  gstPercent?: number | null;
  city: string;
  state: string;
  country: string;
  paymentDueDays: number;
  retentionPercent: number;
  tdsPercent: number;
  dlpMonths: number;
  contractorAssigned?: string | null;
};

export type ContractEditDraft = {
  projectName: string;
  projectNo: string;
  orderNos: string;
  orderDate: string;
  closureDate: string;
  orderValue: string;
  gstPercent: string;
  city: string;
  state: string;
  country: string;
  paymentDueDays: string;
  retentionPercent: string;
  tdsPercent: string;
  dlpMonths: string;
  contractorAssigned: string;
};

export type OpenContractEdit = {
  contractId: string;
  draft: ContractEditDraft;
};

export function draftFromContract(contract: ContractEditSource): ContractEditDraft {
  return {
    projectName: contract.projectName,
    projectNo: contract.projectNo,
    orderNos: contract.orderNos,
    orderDate: contract.orderDate,
    closureDate: contract.closureDate,
    orderValue: String(contract.orderValue),
    gstPercent: gstEditValue(contract),
    city: contract.city,
    state: contract.state,
    country: contract.country,
    paymentDueDays: String(contract.paymentDueDays),
    retentionPercent: String(contract.retentionPercent),
    tdsPercent: String(contract.tdsPercent),
    dlpMonths: String(contract.dlpMonths),
    contractorAssigned: contract.contractorAssigned || "",
  };
}

/**
 * Copy the saved contract in only when this edit page has not already
 * filled that contract. A later snapshot of the same id leaves the draft.
 */
export function keepOpenContractEdit(
  open: OpenContractEdit | null,
  contract: ContractEditSource | null | undefined
): OpenContractEdit | null {
  if (!contract) return open;
  if (open?.contractId === contract.id) return open;
  return { contractId: contract.id, draft: draftFromContract(contract) };
}
