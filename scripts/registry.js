/**
 * Mobile Sheet — adapter registry (Phase 0).
 *
 * The extension point. Built-in adapters self-register on `init`; third-party
 * adapters register via the public module API or the `mobileSheet.ready` hook
 * (see scripts/main.js). A new system = one adapter file, zero core changes,
 * no load-order coupling.
 *
 * @typedef {import("./contract.js").MobileSheetAdapter} MobileSheetAdapter
 */

/** @type {Map<string, MobileSheetAdapter>} systemId -> adapter */
const adapters = new Map();

/**
 * Register an adapter for its system. Last registration for a given systemId
 * wins, letting a third-party module override a built-in adapter.
 * @param {MobileSheetAdapter} adapter
 */
export function register(adapter) {
  if (!adapter?.systemId) {
    console.error("mobile-sheet | register called without a systemId", adapter);
    return;
  }
  adapters.set(adapter.systemId, adapter);
}

/**
 * Resolve the adapter for a system id, or null if none is registered.
 * @param {string} systemId
 * @returns {MobileSheetAdapter|null}
 */
export function resolve(systemId) {
  return adapters.get(systemId) ?? null;
}
