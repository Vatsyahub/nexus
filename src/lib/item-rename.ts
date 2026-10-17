import type {
  Contract,
  FlowhubData,
  Invoice,
  ItemCatalogEntry,
} from "@/lib/types";

/** Catalog identity is the trimmed, lowercased name. One item, one key. */
export function itemNameKey(name: string | null | undefined): string {
  return String(name ?? "").trim().toLowerCase();
}

export type RenameItemResult =
  | { ok: true; data: FlowhubData; from: string; to: string }
  | { ok: false; error: string };

function lineIsThisItem(name: string, fromKey: string): boolean {
  return itemNameKey(name) === fromKey;
}

function catalogEntryIsThisItem(entry: ItemCatalogEntry, fromKey: string): boolean {
  return (
    itemNameKey(entry.name) === fromKey ||
    entry.key.trim().toLowerCase() === fromKey
  );
}

/**
 * Rename one hub item. The catalog row is updated, not copied, so the old
 * spelling does not stay beside the new one. Current BOQ lines and invoice
 * lines take the new name. Rate, unit, and quantity stay. Amendment
 * snapshots and line diffs keep the name they were saved with.
 */
export function renameItemRecords(
  data: FlowhubData,
  fromName: string,
  toName: string
): RenameItemResult {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from) return { ok: false, error: "Item name is required." };
  if (!to) return { ok: false, error: "Enter a new item name." };

  const fromKey = itemNameKey(from);
  const toKey = itemNameKey(to);
  const contracts = data.contracts ?? [];

  const live = contracts.some((contract) =>
    (contract.boq ?? []).some((line) => lineIsThisItem(line.name, fromKey))
  );
  if (!live) return { ok: false, error: "Item not found." };

  if (toKey !== fromKey) {
    const taken = contracts.some((contract) =>
      (contract.boq ?? []).some((line) => {
        const name = String(line?.name ?? "").trim();
        return name && itemNameKey(name) === toKey && !lineIsThisItem(name, fromKey);
      })
    );
    if (taken) return { ok: false, error: `${to} is already an item.` };
  }

  let changed = false;
  const nextContracts = contracts.map((contract) => {
    let lineChanged = false;
    const boq = (contract.boq ?? []).map((line) => {
      if (!lineIsThisItem(line.name, fromKey)) return line;
      if (line.name === to && line.catalogKey === toKey) return line;
      lineChanged = true;
      changed = true;
      return { ...line, name: to, catalogKey: toKey };
    });
    return lineChanged ? { ...contract, boq } : contract;
  });

  const renamedIds = new Set<string>();
  const otherIds = new Set<string>();
  for (const contract of contracts) {
    for (const line of contract.boq ?? []) {
      if (lineIsThisItem(line.name, fromKey)) renamedIds.add(line.id);
      else otherIds.add(line.id);
    }
  }

  const nextInvoices = (data.invoices ?? []).map((invoice) => {
    let lineChanged = false;
    const lines = invoice.lines.map((line) => {
      const sameName = itemNameKey(line.itemName) === fromKey;
      const hit =
        renamedIds.has(line.boqItemId) ||
        (sameName && !otherIds.has(line.boqItemId));
      if (!hit || line.itemName === to) return line;
      lineChanged = true;
      changed = true;
      return { ...line, itemName: to };
    });
    return lineChanged ? { ...invoice, lines } : invoice;
  });

  const source =
    (data.itemCatalog ?? []).find(
      (entry) => entry.key.trim().toLowerCase() === fromKey
    ) ??
    (data.itemCatalog ?? []).find((entry) => catalogEntryIsThisItem(entry, fromKey));
  let unit = source?.unit || "Nos";
  let lastRate = source?.lastRate ?? 0;
  if (!source) {
    for (const contract of contracts) {
      const line = (contract.boq ?? []).find((row) =>
        lineIsThisItem(row.name, fromKey)
      );
      if (!line) continue;
      unit = line.unit || "Nos";
      lastRate = Number(line.rate) || 0;
      break;
    }
  }

  const nextEntry: ItemCatalogEntry = { key: toKey, name: to, unit, lastRate };
  let replaced = false;
  const nextCatalog: ItemCatalogEntry[] = [];
  for (const entry of data.itemCatalog ?? []) {
    const key = entry.key.trim().toLowerCase();
    const sameItem = catalogEntryIsThisItem(entry, fromKey);
    const targetSlot = key === toKey;
    if (sameItem || targetSlot) {
      if (!replaced) {
        nextCatalog.push(nextEntry);
        replaced = true;
        if (
          entry.key !== nextEntry.key ||
          entry.name !== nextEntry.name ||
          entry.unit !== nextEntry.unit ||
          entry.lastRate !== nextEntry.lastRate
        ) {
          changed = true;
        }
      } else {
        changed = true;
      }
      continue;
    }
    nextCatalog.push(entry);
  }
  if (!replaced) {
    nextCatalog.push(nextEntry);
    changed = true;
  }

  if (!changed) return { ok: true, data, from, to };
  return {
    ok: true,
    data: {
      ...data,
      contracts: nextContracts,
      invoices: nextInvoices,
      itemCatalog: nextCatalog,
    },
    from,
    to,
  };
}

/**
 * Names the item pickers may offer. A name qualifies only when a current
 * BOQ line uses it. Amendment history, a renamed spelling, and a removed
 * name are not choices. This is the existing catalog, filtered to those
 * lines — not a second item list.
 */
export function itemNameChoices(data: FlowhubData): ItemCatalogEntry[] {
  const live = new Map<
    string,
    { name: string; unit: string; rate: number; catalogKey: string }
  >();
  for (const contract of data.contracts ?? []) {
    for (const line of contract.boq ?? []) {
      const name = String(line?.name ?? "").trim();
      if (!name) continue;
      const nameKey = itemNameKey(name);
      if (live.has(nameKey)) continue;
      const catalogKey = String(line.catalogKey ?? "").trim().toLowerCase();
      live.set(nameKey, {
        name,
        unit: line.unit || "Nos",
        rate: Number(line.rate) || 0,
        catalogKey: catalogKey || nameKey,
      });
    }
  }

  const byKey = new Map(
    (data.itemCatalog ?? []).map((entry) => [entry.key.trim().toLowerCase(), entry])
  );
  const byName = new Map(
    (data.itemCatalog ?? []).map((entry) => [itemNameKey(entry.name), entry])
  );

  const choices: ItemCatalogEntry[] = [];
  for (const [nameKey, row] of live) {
    const entry = byName.get(nameKey) ?? byKey.get(row.catalogKey);
    if (entry && itemNameKey(entry.name) === nameKey) {
      choices.push({
        key: entry.key,
        name: entry.name.trim(),
        unit: entry.unit || row.unit,
        lastRate: entry.lastRate,
      });
      continue;
    }
    choices.push({
      key: row.catalogKey,
      name: row.name,
      unit: row.unit,
      lastRate: row.rate,
    });
  }
  choices.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return choices;
}

function boqLineInUse(
  data: FlowhubData,
  contractId: string,
  boqItemId: string
): boolean {
  if (
    (data.invoices ?? []).some(
      (invoice) =>
        invoice.contractId === contractId &&
        invoice.lines.some((line) => line.boqItemId === boqItemId)
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
        challan.lines.some((line) => line.boqItemId === boqItemId)
    )
  ) {
    return true;
  }
  return false;
}

/**
 * A non-Master save cannot rename an item that is already on an invoice,
 * schedule, or delivery challan. Quantity, rate, and unit on that line
 * still follow the save. Unused lines can still be edited in the BOQ.
 */
export function keepInUseItemNames(
  current: FlowhubData,
  contracts: Contract[],
  invoices: Invoice[],
  itemCatalog: ItemCatalogEntry[]
): {
  contracts: Contract[];
  invoices: Invoice[];
  itemCatalog: ItemCatalogEntry[];
} {
  const locked = new Map<string, { name: string; catalogKey: string }>();
  for (const contract of current.contracts ?? []) {
    for (const line of contract.boq ?? []) {
      if (!line?.id) continue;
      if (!boqLineInUse(current, contract.id, line.id)) continue;
      locked.set(`${contract.id}\0${line.id}`, {
        name: line.name,
        catalogKey: line.catalogKey,
      });
    }
  }
  if (locked.size === 0) return { contracts, invoices, itemCatalog };

  const nextContracts = contracts.map((contract) => {
    let changed = false;
    const boq = (contract.boq ?? []).map((line) => {
      const prev = locked.get(`${contract.id}\0${line.id}`);
      if (!prev) return line;
      if (line.name === prev.name && line.catalogKey === prev.catalogKey) return line;
      changed = true;
      return { ...line, name: prev.name, catalogKey: prev.catalogKey };
    });
    return changed ? { ...contract, boq } : contract;
  });

  const nextInvoices = invoices.map((invoice) => {
    let changed = false;
    const lines = invoice.lines.map((line) => {
      const prev = locked.get(`${invoice.contractId}\0${line.boqItemId}`);
      if (!prev || line.itemName === prev.name) return line;
      changed = true;
      return { ...line, itemName: prev.name };
    });
    return changed ? { ...invoice, lines } : invoice;
  });

  const lockedKeys = new Set<string>();
  const lockedNames = new Set<string>();
  for (const prev of locked.values()) {
    const key = prev.catalogKey.trim().toLowerCase();
    const name = itemNameKey(prev.name);
    if (key) lockedKeys.add(key);
    if (name) lockedNames.add(name);
  }
  const currentByKey = new Map(
    (current.itemCatalog ?? []).map((entry) => [
      entry.key.trim().toLowerCase(),
      entry,
    ])
  );
  const seen = new Set<string>();
  const nextCatalog: ItemCatalogEntry[] = [];
  for (const entry of itemCatalog) {
    const key = entry.key.trim().toLowerCase();
    seen.add(key);
    const stored = currentByKey.get(key);
    const storedName = stored ? itemNameKey(stored.name) : "";
    if (
      stored &&
      (lockedKeys.has(key) || (storedName && lockedNames.has(storedName)))
    ) {
      nextCatalog.push(stored);
      continue;
    }
    nextCatalog.push(entry);
  }
  for (const [key, stored] of currentByKey) {
    if (seen.has(key)) continue;
    const name = itemNameKey(stored.name);
    if (lockedKeys.has(key) || (name && lockedNames.has(name))) {
      nextCatalog.push(stored);
    }
  }

  return {
    contracts: nextContracts,
    invoices: nextInvoices,
    itemCatalog: nextCatalog,
  };
}
