// Where saves are kept in the browser: a tiny IndexedDB store with two slots,
// "auto" (written once per game day) and "manual" (the Save button).
// Every call fails softly: private windows and some browsers refuse IndexedDB, and the game must still run.
import { readSave, type SaveFile } from "../sim";

export type Slot = "auto" | "manual";
const DB = "noyan", STORE = "saves";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** stores a save; returns false when the browser refused */
export async function store(slot: Slot, save: SaveFile): Promise<boolean> {
  try {
    await run("readwrite", s => s.put(save, slot));
    return true;
  } catch {
    return false;
  }
}

/** the save in a slot, or null when there is none or it cannot be read */
export async function load(slot: Slot): Promise<SaveFile | null> {
  try {
    const data = await run("readonly", s => s.get(slot));
    return data ? readSave(data) : null;
  } catch {
    return null;
  }
}

/** the most recent of the two slots */
export async function latest(): Promise<SaveFile | null> {
  const [a, m] = await Promise.all([load("auto"), load("manual")]);
  if (!a || !m) return a ?? m;
  return a.savedAt >= m.savedAt ? a : m;
}

/** offers a save as a file to download */
export function exportFile(save: SaveFile, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
