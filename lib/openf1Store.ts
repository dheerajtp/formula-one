/**
 * Browser-side store of OpenF1 responses (IndexedDB), so data a visitor has
 * already seen keeps working while OpenF1 pauses free access during live F1
 * sessions. Every call is best-effort: private mode, blocked storage or a quota
 * error simply means "not stored", never a failure for the page.
 */

const DB_NAME = "f1-openf1";
const STORE = "responses";
/** Storage budget for saved responses; oldest entries are evicted beyond it. */
const MAX_BYTES = 60 * 1024 * 1024;

interface Entry {
  url: string;
  body: unknown;
  bytes: number;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "url" });
        store.createIndex("savedAt", "savedAt");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function done<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function storeGet<T>(url: string): Promise<T | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const entry = await done<Entry | undefined>(db.transaction(STORE).objectStore(STORE).get(url));
    return entry ? (entry.body as T) : null;
  } catch {
    return null;
  }
}

export async function storePut(url: string, body: unknown): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const bytes = JSON.stringify(body).length;
    if (bytes > MAX_BYTES) return;
    const entry: Entry = { url, body, bytes, savedAt: Date.now() };
    await done(db.transaction(STORE, "readwrite").objectStore(STORE).put(entry));
    void prune(db);
  } catch {
    /* not stored — the page still has the in-memory copy */
  }
}

let pruning = false;

/** Evict oldest entries until the total is back under the budget. */
async function prune(db: IDBDatabase): Promise<void> {
  if (pruning) return;
  pruning = true;
  try {
    const all = (await done<Entry[]>(db.transaction(STORE).objectStore(STORE).getAll())) ?? [];
    let total = all.reduce((sum, entry) => sum + entry.bytes, 0);
    if (total <= MAX_BYTES) return;
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    for (const entry of all.sort((a, b) => a.savedAt - b.savedAt)) {
      if (total <= MAX_BYTES) break;
      store.delete(entry.url);
      total -= entry.bytes;
    }
  } catch {
    /* best effort */
  } finally {
    pruning = false;
  }
}
