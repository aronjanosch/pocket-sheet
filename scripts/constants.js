/** Pocket Sheets — Daggerheart — shared constants. Imported by every module; imports nothing (no cycles). */
export const MODULE_ID = "pocket-sheets-daggerheart";

// --- device detection (shared by launcher activation + sheet layout) ---------
// Lives here, not in launcher.js, so sheet.js can read it without an import cycle
// (launcher.js already imports PocketSheet from sheet.js). Browser-standard media
// queries — identical on Foundry v13/v14.

const mq = (q) => window.matchMedia?.(q)?.matches ?? false;

/** Touch-primary AND phone-width. The pure "sheet device": canvas off, full-screen. */
export function isPhone() {
  return mq("(pointer: coarse)") && mq("(max-width: 768px)");
}

/** Touch-primary AND tablet-width (iPad portrait ~810/834 … landscape 1024–1366).
 *  Drives the 3-pane iPad layout. Both conditions, so a resized desktop window or a
 *  touch laptop (fine pointer) never qualifies. */
export function isTablet() {
  return mq("(pointer: coarse)") && mq("(min-width: 769px)") && mq("(max-width: 1366px)");
}

/** Any pocket device (phone or tablet): gets canvas-off + full-screen sheet-only chrome. */
export function isPocketDevice() {
  return isPhone() || isTablet();
}
