const LIMIT = 3;
const KEY = "subledger.entitlement.v1";

export interface Entitlement {
  unlocked: boolean;
  unlockedAt?: string;
}

export function readEntitlement(): Entitlement {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { unlocked: false };
    const parsed = JSON.parse(raw) as Entitlement;
    return { unlocked: Boolean(parsed.unlocked), unlockedAt: parsed.unlockedAt };
  } catch {
    return { unlocked: false };
  }
}

export function writeEntitlement(ent: Entitlement): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ent));
  } catch {
    /* ignore */
  }
}

export function freeLimit(): number {
  return LIMIT;
}

export function recordCountStorageKey(): string {
  return "subledger.records.count";
}
