import { itemNameChoices, itemNameKey } from "@/lib/item-rename";
import type {
  BoqItem,
  Contract,
  FlowhubData,
  Invoice,
  ItemCatalogEntry,
} from "@/lib/types";

/**
 * Master replaces the item on one BOQ line with an item that already exists.
 * The line keeps its id, rate, quantity, and unit. The shared catalog entry
 * is not written. Dispatch, installations, and schedules keep the line id.
 */

export type SwapBoqItemResult =
  | { ok: true; data: FlowhubData }
  | { ok: false; error: string };

export type SwapBoqItemInput = {
  contractId: string;
  boqItemId: string;
  itemKey: string;
  clearance: string | null | undefined;
};

function normKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Same check workspace-guard uses for Master. */
function isMaster(clearance: string | null | undefined): boolean {
  return clearance === "master";
}

function lineInUse(
  data: FlowhubData,
  contractId: string,
  boqItemId: string
): boolean {
  if (
    (data.invoices ?? []).some(
      (invoice) =>
        invoice.contractId === contractId &&
        (invoice.lines ?? []).some((line) => line.boqItemId === boqItemId)
    )
  ) {
    return true;
  }
  if (
    (data.schedules ?? []).some(
      (line) => line.contractId === contractId && line.boqItemId === boqItemId
    )
  ) {
    return true;
  }
  if (
    (data.deliveryChallans ?? []).some(
      (challan) =>
        challan.contractId === contractId &&
        (challan.lines ?? []).some((line) => line.boqItemId === boqItemId)
    )
  ) {
    return true;
  }
  return false;
}

/** Catalog row first, then a name already on a current BOQ line. */
export function findExistingBoqItem(
  data: FlowhubData,
  token: string
): ItemCatalogEntry | null {
  const key = normKey(token);
  if (!key) return null;
  const catalog = data.itemCatalog ?? [];
  const byKey = catalog.find((entry) => normKey(entry.key) === key);
  if (byKey && byKey.name.trim()) return byKey;
  const byName = catalog.find((entry) => itemNameKey(entry.name) === key);
  if (byName && byName.name.trim()) return byName;
  return (
    itemNameChoices(data).find(
      (entry) => normKey(entry.key) === key || itemNameKey(entry.name) === key
    ) ?? null
  );
}

function storedIdentity(entry: ItemCatalogEntry): { name: string; key: string } {
  return { name: entry.name.trim(), key: entry.key.trim() };
}

function contractHasAmendments(contract: Contract | undefined): boolean {
  return (contract?.amendments ?? []).length > 0;
}

function nameOnAnotherLine(
  boq: BoqItem[],
  lineId: string,
  name: string
): boolean {
  const key = itemNameKey(name);
  if (!key) return false;
  return boq.some((line) => line.id !== lineId && itemNameKey(line.name) === key);
}

/**
 * Point one BOQ line at an existing item. Does not write the catalog.
 * Rejects anyone who is not Master, a contract that already has an
 * amendment, a name already on the contract, and an item that is not
 * already stored.
 */
export function swapContractBoqItem(
  data: FlowhubData,
  input: SwapBoqItemInput
): SwapBoqItemResult {
  if (!isMaster(input.clearance)) {
    return { ok: false, error: "Only Master can replace a BOQ item." };
  }
  const contract = (data.contracts ?? []).find((row) => row.id === input.contractId);
  if (!contract) return { ok: false, error: "Contract not found." };
  const line = (contract.boq ?? []).find((row) => row.id === input.boqItemId);
  if (!line) return { ok: false, error: "BOQ line not found." };
  if (contractHasAmendments(contract)) {
    return {
      ok: false,
      error: "This contract has an amendment, so the item cannot be replaced.",
    };
  }
  const chosen = findExistingBoqItem(data, input.itemKey);
  if (!chosen) return { ok: false, error: "That item does not exist." };
  const identity = storedIdentity(chosen);
  if (!identity.name || !identity.key) {
    return { ok: false, error: "That item does not exist." };
  }
  if (itemNameKey(line.name) === itemNameKey(identity.name)) {
    return { ok: false, error: "That item is already on this line." };
  }
  if (nameOnAnotherLine(contract.boq ?? [], line.id, identity.name)) {
    return { ok: false, error: "That item is already on this contract." };
  }

  let invoicesChanged = false;
  const invoices = (data.invoices ?? []).map((invoice) => {
    if (invoice.contractId !== contract.id) return invoice;
    let lineChanged = false;
    const lines = (invoice.lines ?? []).map((invoiceLine) => {
      if (invoiceLine.boqItemId !== line.id) return invoiceLine;
      if (invoiceLine.itemName === identity.name) return invoiceLine;
      lineChanged = true;
      invoicesChanged = true;
      return { ...invoiceLine, itemName: identity.name };
    });
    return lineChanged ? { ...invoice, lines } : invoice;
  });

  const contracts = (data.contracts ?? []).map((row) => {
    if (row.id !== contract.id) return row;
    return {
      ...row,
      boq: (row.boq ?? []).map((boqLine) =>
        boqLine.id === line.id
          ? { ...boqLine, name: identity.name, catalogKey: identity.key }
          : boqLine
      ),
    };
  });

  return {
    ok: true,
    data: {
      ...data,
      contracts,
      invoices: invoicesChanged ? invoices : data.invoices,
    },
  };
}

function catalogEntryRenamed(
  currentCatalog: ItemCatalogEntry[],
  incomingCatalog: ItemCatalogEntry[],
  line: BoqItem
): boolean {
  const oldKey = normKey(line.catalogKey);
  const oldName = itemNameKey(line.name);
  const currentEntry =
    currentCatalog.find((entry) => normKey(entry.key) === oldKey) ??
    currentCatalog.find((entry) => itemNameKey(entry.name) === oldName);
  if (!currentEntry) return false;
  const key = normKey(currentEntry.key);
  const incomingEntry = incomingCatalog.find((entry) => normKey(entry.key) === key);
  if (!incomingEntry) return true;
  return itemNameKey(incomingEntry.name) !== itemNameKey(currentEntry.name);
}

/**
 * A Master item-list rename moves every current line off the old name and
 * changes that catalog entry. Leave that save alone. A one-line name change
 * that leaves the catalog entry in place is the BOQ item swap.
 */
function isCatalogRename(
  current: FlowhubData,
  contracts: Contract[],
  itemCatalog: ItemCatalogEntry[],
  line: BoqItem
): boolean {
  if (!catalogEntryRenamed(current.itemCatalog ?? [], itemCatalog, line)) {
    return false;
  }
  const oldName = itemNameKey(line.name);
  for (const stored of current.contracts ?? []) {
    const incoming = contracts.find((row) => row.id === stored.id);
    for (const storedLine of stored.boq ?? []) {
      if (itemNameKey(storedLine.name) !== oldName) continue;
      const incomingLine = (incoming?.boq ?? []).find((row) => row.id === storedLine.id);
      if (!incomingLine) continue;
      if (itemNameKey(incomingLine.name) === oldName) return false;
    }
  }
  return true;
}

function chosenForIncoming(
  current: FlowhubData,
  incomingLine: BoqItem,
  keyChanged: boolean
): ItemCatalogEntry | null {
  if (keyChanged) {
    const byKey = findExistingBoqItem(current, incomingLine.catalogKey);
    if (byKey) return byKey;
  }
  return findExistingBoqItem(current, incomingLine.name);
}

/**
 * On a Master save, an in-use line may take another existing item's name
 * and catalog key only. Rate, quantity, and unit on the line stay with
 * whatever else the save changed. The chosen catalog entry keeps its stored
 * rate and unit. Any other in-use name change is put back, including for
 * Master. A catalog rename of that item is left as saved.
 */
export function applyMasterBoqSwapGuard(
  current: FlowhubData,
  contracts: Contract[],
  invoices: Invoice[],
  itemCatalog: ItemCatalogEntry[]
): {
  contracts: Contract[];
  invoices: Invoice[];
  itemCatalog: ItemCatalogEntry[];
} {
  const linePatch = new Map<string, { name: string; catalogKey: string }>();
  const invoiceName = new Map<string, string>();
  const restoreCatalog = new Map<string, ItemCatalogEntry>();
  const rejectedNewKeys = new Set<string>();

  for (const storedContract of current.contracts ?? []) {
    const incomingContract = contracts.find((row) => row.id === storedContract.id);
    if (!incomingContract) continue;
    for (const storedLine of storedContract.boq ?? []) {
      if (!storedLine?.id) continue;
      if (!lineInUse(current, storedContract.id, storedLine.id)) continue;
      const incomingLine = (incomingContract.boq ?? []).find(
        (row) => row.id === storedLine.id
      );
      if (!incomingLine) continue;
      const nameChanged = itemNameKey(incomingLine.name) !== itemNameKey(storedLine.name);
      const keyChanged = normKey(incomingLine.catalogKey) !== normKey(storedLine.catalogKey);
      if (!nameChanged && !keyChanged) continue;
      if (isCatalogRename(current, contracts, itemCatalog, storedLine)) continue;

      const chosen = chosenForIncoming(current, incomingLine, keyChanged);
      const identity = chosen ? storedIdentity(chosen) : null;
      const amendments =
        contractHasAmendments(storedContract) ||
        contractHasAmendments(incomingContract);
      const duplicate = identity
        ? nameOnAnotherLine(incomingContract.boq ?? [], storedLine.id, identity.name)
        : false;
      const sameItem =
        !!identity && itemNameKey(identity.name) === itemNameKey(storedLine.name);
      const valid = !!identity?.name && !!identity.key && !amendments && !duplicate && !sameItem;
      const mapKey = `${storedContract.id}\0${storedLine.id}`;
      if (valid && identity) {
        linePatch.set(mapKey, { name: identity.name, catalogKey: identity.key });
        invoiceName.set(mapKey, identity.name);
        const storedEntry = (current.itemCatalog ?? []).find(
          (entry) => normKey(entry.key) === normKey(identity.key)
        );
        if (storedEntry) restoreCatalog.set(normKey(storedEntry.key), storedEntry);
      } else {
        linePatch.set(mapKey, {
          name: storedLine.name,
          catalogKey: storedLine.catalogKey,
        });
        invoiceName.set(mapKey, storedLine.name);
        const rejectedKey = normKey(incomingLine.catalogKey);
        if (rejectedKey && rejectedKey !== normKey(storedLine.catalogKey)) {
          rejectedNewKeys.add(rejectedKey);
        }
        const rejectedName = itemNameKey(incomingLine.name);
        if (rejectedName && rejectedName !== itemNameKey(storedLine.name)) {
          rejectedNewKeys.add(rejectedName);
        }
      }
    }
  }

  if (linePatch.size === 0 && restoreCatalog.size === 0) {
    return { contracts, invoices, itemCatalog };
  }

  const nextContracts = contracts.map((contract) => {
    let changed = false;
    const boq = (contract.boq ?? []).map((line) => {
      const patch = linePatch.get(`${contract.id}\0${line.id}`);
      if (!patch) return line;
      if (line.name === patch.name && line.catalogKey === patch.catalogKey) return line;
      changed = true;
      return { ...line, name: patch.name, catalogKey: patch.catalogKey };
    });
    return changed ? { ...contract, boq } : contract;
  });

  const nextInvoices = invoices.map((invoice) => {
    let changed = false;
    const lines = (invoice.lines ?? []).map((line) => {
      const name = invoiceName.get(`${invoice.contractId}\0${line.boqItemId}`);
      if (name == null || line.itemName === name) return line;
      changed = true;
      return { ...line, itemName: name };
    });
    return changed ? { ...invoice, lines } : invoice;
  });

  let nextCatalog = itemCatalog;
  if (restoreCatalog.size > 0 || rejectedNewKeys.size > 0) {
    const seen = new Set<string>();
    nextCatalog = [];
    for (const entry of itemCatalog) {
      const key = normKey(entry.key);
      seen.add(key);
      const stored = restoreCatalog.get(key);
      if (stored) {
        nextCatalog.push(stored);
        continue;
      }
      const added = !(current.itemCatalog ?? []).some(
        (row) => normKey(row.key) === key
      );
      const rejected =
        added &&
        (rejectedNewKeys.has(key) || rejectedNewKeys.has(itemNameKey(entry.name)));
      if (rejected) {
        const used = nextContracts.some((contract) =>
          (contract.boq ?? []).some(
            (line) =>
              normKey(line.catalogKey) === key ||
              itemNameKey(line.name) === itemNameKey(entry.name)
          )
        );
        if (!used) continue;
      }
      nextCatalog.push(entry);
    }
    for (const [key, stored] of restoreCatalog) {
      if (!seen.has(key)) nextCatalog.push(stored);
    }
  }

  return {
    contracts: nextContracts,
    invoices: nextInvoices,
    itemCatalog: nextCatalog,
  };
}
