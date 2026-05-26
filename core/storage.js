/* ============================================================
   core/storage.js
   Tiny IndexedDB wrapper.
   - One database for the whole app: 'smartapp'
   - Each module uses its own object store (e.g. 'documents')
   - Files stored as Blobs alongside JSON metadata
   - Promise-based API so modules can `await` it cleanly
   ============================================================ */

const DB_NAME = 'smartapp';
// IMPORTANT: bump this number whenever STORES changes, otherwise the new
// store is never physically created and transactions throw
// "object store was not found". v4 = ensure all four stores exist on
// installs whose database predates one of them.
const DB_VERSION = 4;

// Register stores up-front so future modules can declare them here.
// Adding a name here ALSO requires bumping DB_VERSION above.
const STORES = [
  'documents',     // Document Hub
  'signupkit',     // Sign-Up Kit accounts
  'signup_urls',   // Sign-Up Kit URLs (independent list)
  'reader_notes',  // Reader / Notes module
];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Create every registered store that doesn't already exist.
      // Safe to run repeatedly — existing stores are skipped, so no
      // data is lost when this fires on an upgrade.
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Self-heal: if the DB somehow opened without every store (e.g. a
      // half-finished upgrade on an older build), close and reopen at a
      // higher version to force onupgradeneeded to create the rest.
      const missing = STORES.filter(s => !db.objectStoreNames.contains(s));
      if (missing.length > 0) {
        const bumpedVersion = db.version + 1;
        db.close();
        _dbPromise = null;
        const retry = indexedDB.open(DB_NAME, bumpedVersion);
        retry.onupgradeneeded = () => {
          const rdb = retry.result;
          for (const name of STORES) {
            if (!rdb.objectStoreNames.contains(name)) {
              rdb.createObjectStore(name, { keyPath: 'id' });
            }
          }
        };
        retry.onsuccess = () => resolve(retry.result);
        retry.onerror   = () => reject(retry.error);
        return;
      }
      resolve(db);
    };
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  // Clear, actionable error instead of the cryptic native one.
  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error(
      `Storage error: object store "${storeName}" is missing. ` +
      `Reload the app — if this persists, the database needs a version bump.`
    );
  }
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
