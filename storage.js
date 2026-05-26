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
// "object store was not found". v7 = safe ceiling above any version the
// self-heal auto-bump could have reached (v5) + prior deployments (v3).
const DB_VERSION = 7;

// Register stores up-front so future modules can declare them here.
// Adding a name here ALSO requires bumping DB_VERSION above.
const STORES = [
  'documents',     // Document Hub
  'signupkit',     // Sign-Up Kit accounts
  'signup_urls',   // Sign-Up Kit URLs (independent list)
  'reader_notes',  // Reader / Notes module
];

let _dbPromise = null;

/* openDB — opens (or upgrades) the IndexedDB.
   Recovery path: if the stored version is somehow HIGHER than DB_VERSION
   (can happen when an older cached build is served by a stale service
   worker), detect the VersionError, open without a version constraint to
   read the real current version, then immediately reopen at DB_VERSION or
   current+1 — whichever is higher — so all stores exist. */
function _applyUpgrade(db) {
  for (const name of STORES) {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, { keyPath: 'id' });
    }
  }
}

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => _applyUpgrade(req.result);

    // onblocked fires when another tab holds a connection at an older version.
    req.onblocked = () => {
      console.warn('[storage] IDB upgrade blocked — close other SmartApp tabs and reload.');
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
        retry.onupgradeneeded = () => _applyUpgrade(retry.result);
        retry.onsuccess = () => resolve(retry.result);
        retry.onerror   = () => reject(retry.error);
        return;
      }
      resolve(db);
    };
    req.onerror = (ev) => {
      const err = req.error;
      // VersionError: the stored DB version is HIGHER than DB_VERSION.
      // This means a stale cached script (served by the service worker)
      // tried to open with a lower number. Open without a version to find
      // the real current version, then reopen at max(DB_VERSION, current)
      // so all our stores are created.
      if (err && err.name === 'VersionError') {
        console.warn('[storage] VersionError — probing real DB version for recovery…');
        _dbPromise = null;
        const probe = indexedDB.open(DB_NAME);
        probe.onsuccess = () => {
          const realVersion = probe.result.version;
          probe.result.close();
          const targetVersion = Math.max(DB_VERSION, realVersion + 1);
          const fix = indexedDB.open(DB_NAME, targetVersion);
          fix.onupgradeneeded = () => _applyUpgrade(fix.result);
          fix.onsuccess = () => {
            console.info('[storage] VersionError recovery succeeded at v' + targetVersion);
            resolve(fix.result);
          };
          fix.onerror = () => reject(fix.error);
        };
        probe.onerror = () => reject(probe.error);
        return;
      }
      reject(err);
    };
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
