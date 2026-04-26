/* ============================================================
   core/storage.js
   Tiny IndexedDB wrapper.
   - One database for the whole app: 'smartapp'
   - Each module uses its own object store (e.g. 'documents')
   - Files stored as Blobs alongside JSON metadata
   - Promise-based API so modules can `await` it cleanly
   ============================================================ */

const DB_NAME = 'smartapp';
const DB_VERSION = 1;

// Register stores up-front so future modules can declare them here.
const STORES = [
  'documents',   // Document Hub
  // 'receipts_meta', etc. — add new stores in future steps
];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

/* ---------- Public API ---------- */

export const db = {
  async put(storeName, record) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.put(record);
      r.onsuccess = () => resolve(record);
      r.onerror   = () => reject(r.error);
    });
  },

  async get(storeName, id) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror   = () => reject(r.error);
    });
  },

  async getAll(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror   = () => reject(r.error);
    });
  },

  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.delete(id);
      r.onsuccess = () => resolve();
      r.onerror   = () => reject(r.error);
    });
  },

  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.clear();
      r.onsuccess = () => resolve();
      r.onerror   = () => reject(r.error);
    });
  },

  /** Estimate of storage used (Android Chrome supports this). */
  async usage() {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { used: e.usage || 0, quota: e.quota || 0 };
    }
    return { used: 0, quota: 0 };
  },
};
