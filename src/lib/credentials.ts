import { AppError } from "./errors";
const DB = "audiotext", STORE = "credentials", KEY = "gemini";
const storageError = () => new AppError("STORAGE_UNAVAILABLE", "Browser storage is unavailable or blocked. Allow site data for AudioText, then retry. Changes to your saved key could not be confirmed.");
export function validateApiKey(value: string) {
  const key = value.trim();
  if (!key || key.length > 4096 || !/^[\x21-\x7e]+$/.test(key)) throw new AppError("INVALID_KEY_FORMAT", "Paste the complete API key without spaces or line breaks.");
  return key;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => { settled = true; clearTimeout(timer); reject(storageError()); };
    const timer = setTimeout(fail, 5000);
    try {
      if (typeof indexedDB === "undefined") { fail(); return; }
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onerror = request.onblocked = fail;
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        settled = true;
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    } catch { fail(); }
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* Already complete. */ } reject(storageError()); }, 5000);
      const request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(storageError()); };
    });
  } catch { throw storageError(); }
  finally { db.close(); }
}
export async function saveApiKey(value: string) {
  const key = validateApiKey(value);
  await transaction("readwrite", store => store.put(key, KEY));
}
export async function getApiKey(): Promise<string | null> {
  const value: unknown = await transaction("readonly", store => store.get(KEY));
  return typeof value === "string" && value ? value : null;
}
export async function hasApiKey() { return (await transaction("readonly", store => store.count(KEY))) > 0; }
export async function removeApiKey() { await transaction("readwrite", store => store.delete(KEY)); }
export async function requireApiKey() {
  const key = await getApiKey();
  if (!key) throw new AppError("MISSING_API_KEY", "Add your Gemini API key in Settings before transcribing.");
  return key;
}
