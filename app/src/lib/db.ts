/**
 * IndexedDB timeline (SYSTEM.md §7). Small promise wrapper, no dependency.
 * Stores: app (current state snapshot), basketVersions, priceObservations, comparisons,
 * commands, shoppingEvents (unique per basket per calendar week), profileVersions.
 */
const DB_NAME = 'pro-groceries';
const VERSION = 2;
export const STORES = ['app', 'profileVersions', 'basketVersions', 'priceObservations', 'comparisons', 'commands', 'shoppingEvents', 'searchCache'] as const;
/** Rebuildable data: cleared with everything else, never exported or imported. */
const CACHE_ONLY: ReadonlyArray<string> = ['searchCache'];
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        const s = db.createObjectStore(name, { keyPath: 'id' });
        if (name === 'shoppingEvents') { s.createIndex('weekKey', 'weekKey', { unique: true }); s.createIndex('occurredAt', 'occurredAt'); }
        if (name === 'comparisons') s.createIndex('fetchEndedAt', 'fetchEndedAt');
        if (name === 'basketVersions') s.createIndex('basketId', 'basketId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    let result: T;
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const put = <T extends { id: string }>(store: StoreName, value: T) => tx(store, 'readwrite', s => s.put(value));
export const putMany = <T extends { id: string }>(store: StoreName, values: T[]) =>
  tx<void>(store, 'readwrite', s => { values.forEach(v => s.put(v)); });
export const get = <T>(store: StoreName, id: string) => tx<T | undefined>(store, 'readonly', s => s.get(id));
export const all = <T>(store: StoreName) => tx<T[]>(store, 'readonly', s => s.getAll());
export const del = (store: StoreName, id: string) => tx(store, 'readwrite', s => s.delete(id));

export async function clearAll(): Promise<void> {
  for (const s of STORES) await tx(s, 'readwrite', st => st.clear());
}

export async function exportAll(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const s of STORES) if (!CACHE_ONLY.includes(s)) out[s] = await all(s);
  return out;
}

export async function importAll(data: Record<string, Array<{ id: string }>>): Promise<number> {
  let n = 0;
  for (const s of STORES) {
    if (CACHE_ONLY.includes(s)) continue;
    const rows = data[s];
    if (Array.isArray(rows)) { await putMany(s, rows.filter(r => r && typeof r.id === 'string')); n += rows.length; }
  }
  return n;
}

export async function available(): Promise<boolean> {
  try { await open(); return true; } catch { return false; }
}
