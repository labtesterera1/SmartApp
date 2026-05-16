/* ============================================================
   core/router.js  — PATCH INSTRUCTIONS
   Only 2 lines need adding. Everything else stays identical.
   ============================================================ */

// ── STEP 1: Add this import at the top, with the other module imports ──

import guts      from '../modules/guts.js';   // ← ADD THIS LINE

// ── STEP 2: Add guts to the MODULES array (line ~39) ──────────────────

// BEFORE:
const MODULES = [ledger, documents, reader, sweep, vault];

// AFTER:
const MODULES = [ledger, documents, reader, sweep, vault, guts];

// ── That's it. No other changes to router.js needed. ──────────────────
