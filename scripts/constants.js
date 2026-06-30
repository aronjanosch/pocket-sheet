/** Pocket Sheets — Daggerheart — shared constants. Imported by every module; imports nothing (no cycles). */
export const MODULE_ID = "pocket-sheets-daggerheart";

// --- device detection (shared by launcher activation + sheet layout) ---------
// Lives here, not in launcher.js, so sheet.js can read it without an import cycle
// (launcher.js already imports PocketSheet from sheet.js). Browser-standard media
// queries — identical on Foundry v13/v14.

const mq = (q) => window.matchMedia?.(q)?.matches ?? false;

/** Has a touch screen — even when iPadOS Safari masquerades as a desktop Mac.
 *  "Request Desktop Website" is default-ON for 11"+ iPads (incl. iPad Air 13"),
 *  which makes `(pointer: coarse)` read `fine` and the UA say "Macintosh", so the
 *  old pointer-only test never fired. `maxTouchPoints` is hardware — it survives
 *  desktop mode; `(any-pointer: coarse)` catches phones/tablets in mobile mode. */
function hasTouch() {
  return (navigator.maxTouchPoints ?? 0) > 0 || mq("(any-pointer: coarse)");
}

/** iPadOS in desktop mode reports UA "Macintosh" but, unlike a real Mac, has a
 *  multi-touch screen (maxTouchPoints > 1). Real Macs report 0. Used as a tablet
 *  escape hatch since desktop-mode iPads also report a wide, fine-pointer viewport. */
function isDesktopModeIpad() {
  return /Macintosh/.test(navigator.userAgent ?? "") && (navigator.maxTouchPoints ?? 0) > 1;
}

/** Touch screen AND phone-width. The pure "sheet device": canvas off, full-screen. */
export function isPhone() {
  return hasTouch() && mq("(max-width: 768px)");
}

/** Touch screen AND tablet-width (iPad portrait ~810/834 … landscape 1024–1366),
 *  OR an iPadOS device running in desktop mode (whatever width it reports).
 *  Drives the 3-pane iPad layout; a fine-pointer desktop without touch never qualifies. */
export function isTablet() {
  return (hasTouch() && mq("(min-width: 769px)") && mq("(max-width: 1366px)")) || isDesktopModeIpad();
}

/** Any pocket device (phone or tablet): gets canvas-off + full-screen sheet-only chrome. */
export function isPocketDevice() {
  return isPhone() || isTablet();
}

/** True while THIS device is in fullscreen sheet-only pocket mode (launcher set the body
 *  class after killing the canvas). Lets the sheet/layout react to a *forced* pocket mode
 *  (the toggle macro on a desktop) instead of only hardware detection. */
export function inPocketFullscreen() {
  return document.body?.classList?.contains("pocket-sheets-daggerheart-only") ?? false;
}

/** Should the 3-pane (tablet) layout be used? Real tablets always; plus any device forced
 *  into fullscreen pocket mode on a wide-enough viewport — so a desktop running the toggle
 *  macro gets the same 3-pane layout, not the phone single column. */
export function useTabletLayout() {
  return isTablet() || (inPocketFullscreen() && mq("(min-width: 769px)"));
}
