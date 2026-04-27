/* ============================================================
   core/persistence.js
   - Registers the service worker (Layer 1 part 1)
   - Requests persistent storage (Layer 1 part 2)
   - Exposes status + usage for UI
   ============================================================ */

let _status = {
  swRegistered: false,
  persisted: null,    // null = unknown, true/false once asked
  usage: 0,
  quota: 0,
};

export async function initPersistence() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      _status.swRegistered = true;
    } catch (err) {
      console.warn('[sw] register failed:', err);
    }
  }

  // Request persistent storage
  if (navigator.storage && navigator.storage.persisted) {
    try {
      const already = await navigator.storage.persisted();
      if (already) {
        _status.persisted = true;
      } else if (navigator.storage.persist) {
        // Browser may grant silently or only after PWA install.
        const granted = await navigator.storage.persist();
        _status.persisted = granted;
      }
    } catch (err) {
      console.warn('[storage.persist] failed:', err);
    }
  }

  // Initial usage estimate
  await refreshUsage();
}

export async function refreshUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const e = await navigator.storage.estimate();
      _status.usage = e.usage || 0;
      _status.quota = e.quota || 0;
    } catch {}
  }
  return _status;
}

export function getStatus() {
  return { ..._status };
}

/** Re-request persistence — useful after PWA install. */
export async function tryUpgrade() {
  if (navigator.storage && navigator.storage.persist && !_status.persisted) {
    try {
      _status.persisted = await navigator.storage.persist();
    } catch {}
  }
  return _status.persisted;
}
