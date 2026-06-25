# Spec — Phase 3: Activation & Actor Selection

Status: draft · Depends on: Phase 1 (core shell), Phase 2 (Daggerheart adapter) · Blocks: real phone testing

The activation layer. Phases 1–2 require a player to *manually* select "Mobile Sheet" from the sheet-config dropdown — fine for a maintainer, painful on a phone. Phase 3 makes the mobile sheet **present itself** on mobile clients and lets a player who owns several actors **pick which one**.

This is purely a client-side presentation concern. It reads no `actor.system`, touches no world data, adds no sync. It decides *when* to show the shell and *for which actor* — nothing about *what* the shell renders (that is the adapter, untouched here).

> **Scope discipline (carried from the roadmap):** still not a VTT. We do not hide Foundry's UI, take over navigation, or replace the desktop experience. We auto-open one sheet and offer a way back to it. Everything else stays vanilla Foundry.

---

## 1. Deliverables

1. **Mobile detection** — a single `isMobile()` predicate + a client `activation` setting (`auto` / `always` / `never`).
2. **Launcher** — on `ready`, when active, resolve the target actor and open `MobileSheet` for it.
3. **Actor resolution** — assigned character → single owned actor → actor selector.
4. **Actor selector** — a minimal `ApplicationV2` list of the player's owned actors (only when the choice is ambiguous, or invoked manually).
5. **Persistent reopen / switch control** — a floating button so a closed sheet can be reopened and the actor switched without desktop chrome.
6. Lang strings for all new UI.
7. Acceptance criteria (§9).

**Not in scope:** intercepting *every* sheet-open so sidebar/token clicks also route to the mobile sheet (see §8 open Q1 — deferred); hiding the Foundry desktop UI; theming.

---

## 2. Mobile detection

No Foundry core API reports "is this a phone". Decide from the browser, client-side only.

```js
function isMobile() {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrow = window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
  return coarse && narrow;          // touch-primary AND phone/tablet-width
}
```

- `pointer: coarse` distinguishes touch-primary devices from a narrow desktop window. Requiring **both** avoids false-positives on a resized desktop browser and false-negatives on a touch laptop.
- Browser-standard `matchMedia` — identical on v13 and v14, no version branch.
- UA sniffing is deliberately avoided (brittle, iPadOS lies).

### Activation setting (client scope)

A `client`-scope setting `activation` overrides detection so it is never a trap:

| Value | Behavior |
|---|---|
| `auto` (default) | Launch on `ready` iff `isMobile()`. |
| `always` | Always launch (lets desktop users opt in / lets us test). |
| `never` | Never auto-launch; launcher button still reachable. |

`game.settings.register(MODULE_ID, "activation", { scope: "client", config: true, type: String, choices: {...}, default: "auto" })`.

`shouldActivate() = activation === "always" || (activation === "auto" && isMobile())`.

---

## 3. Launcher (the `ready` flow)

On `Hooks.once("ready")`, after `registerMobileSheet()` (so the sheet class is registered):

```
if (!shouldActivate()) return;        // still install the FAB (§6); just don't auto-open
const actor = await resolveTargetActor();
if (actor) openMobileSheet(actor);    // else: selector already shown, or nothing owned
```

- `openMobileSheet(actor)` opens the shell **explicitly**, bypassing Foundry's default-sheet machinery entirely:

  ```js
  new MobileSheet({ document: actor }).render(true);
  ```

  This is the crux decision: **we do not change the world's default sheet class.** Foundry stores the default sheet per-world (`core.sheetClasses`) and per-actor (`flags.core.sheetClass`) — neither is per-client, so flipping it for a mobile player would also change it for the DM on the desktop. An explicit `render` sidesteps that: the desktop experience is byte-for-byte unchanged, and we still benefit from the `registerSheet` registration (Phase 1) so the sheet is *also* manually selectable.
- Guard against opening duplicates: if a `MobileSheet` for this actor is already rendered, bring it to front instead of constructing a second.

---

## 4. Actor resolution

`resolveTargetActor()` picks the actor to present, in priority order:

1. **Assigned character** — `game.user.character`, if set and owned. The Foundry-native "this is my PC" pointer; the common case.
2. **Sole owned actor** — if the player owns exactly one actor of a type the active adapter supports, use it.
3. **Ambiguous** — owns several → show the **actor selector** (§5) and let the player choose. Resolution returns nothing; the selector drives `openMobileSheet`.
4. **None owned** — do nothing (a GM-only / spectator client). FAB still present so they can pick later.

Owned-actor set:

```js
game.actors.filter((a) => a.isOwner && adapterSupportsType(a.type));
```

`adapterSupportsType` reuses the active adapter's `actorTypes` (already used by `registerMobileSheet`); if no adapter, fall back to all types (the shell will show its `no-adapter` state — never an error). This is the **only** adapter coupling in Phase 3, and it is just the type-allowlist already exposed by the contract — no new contract surface.

---

## 5. Actor selector

A minimal `ApplicationV2` (`HandlebarsApplicationMixin`), not a sheet — it owns no document.

- **Renders:** a single-column, big-tap-target list of owned actors → name + portrait (`actor.img`, `actor.name`). Same mobile-first CSS language as the shell.
- **Tap an entry** → `openMobileSheet(actor)` and close the selector.
- **Invoked when:** resolution is ambiguous (§4.3), **or** the player taps "switch actor" on the FAB / in the open sheet.
- One row → it can auto-pick (skip the dialog) when called from the launcher; when invoked manually it always shows (the point is to switch).
- Reads only `actor.name` / `actor.img` / `actor.id` — no `actor.system`. Selector stays system-agnostic like the shell.

Template: `templates/actor-selector.hbs`. Class: `scripts/launcher.js` (or `scripts/actor-selector.js`).

---

## 6. Persistent reopen / switch control

On a phone there is no comfortable desktop sidebar to reopen a closed sheet. A small **floating action button** (FAB), fixed bottom-corner, installed on `ready` whenever `shouldActivate()` (i.e. even with `activation: never`, so it is always a way in):

- **Tap** → reopen the mobile sheet for the last/assigned actor (re-runs `resolveTargetActor`).
- **Long-press / secondary** → open the actor selector to switch actors.
- Pure DOM injected into the document body (not a Foundry UI region) so it survives sheet open/close. `z-index` above the sheet is not needed — it sits beside it.
- Hidden entirely on non-activated desktop unless `activation !== never` chooses to show it. Keep it unobtrusive; it is the one piece of persistent module chrome.

> The FAB is the lightest possible "launcher home." If it proves unnecessary once auto-open lands, it is the first thing to cut — but on a phone, "I closed my sheet, how do I get it back" is otherwise a dead end.

---

## 7. CSS / templates

- Reuse Phase 1 tokens + mobile-first rules. Selector list = same row styling as `actionList`.
- FAB: 56px circular tap target, safe-area-inset aware (`env(safe-area-inset-*)`), bottom-trailing.
- No system theming (Phase 5).

---

## 8. Open questions

1. **Full sheet-open interception (deferred).** Should tapping an actor in the sidebar / a token on mobile *also* route to the mobile sheet, not the system default? There is no clean per-client default-sheet hook in v13/v14; doing it means intercepting render (overriding `Actor#sheet` or a `renderActorSheet`-era hook) which is invasive and version-fragile. **Recommendation: defer to v2.** Phase 3 ships auto-open + FAB; that covers the in-person flow (open my sheet, keep it open). Revisit only if users ask.
2. **FAB vs. no FAB.** If auto-open + "sheet stays open" is enough in real phone testing, the FAB may be dead weight. Build it, but treat as cut-candidate after the live phone test.
3. **Selector for GMs.** A GM owns every actor → selector would be huge. Gate the "sole/ambiguous owned" logic so GMs are treated as case §4.4 (do nothing unless they have an assigned character)? Lean yes — assigned-character-first already handles the GM-with-a-PC case. Confirm at build.
4. **`max-width: 768px` threshold.** Tablets in landscape exceed it. Acceptable for v1 (tablets can manually select the sheet or set `activation: always`); revisit if tablet users complain.

---

## 9. Acceptance criteria

- [ ] On a phone-width, touch client (or `activation: always`), opening the world auto-presents the mobile sheet for the assigned character on both v13 and v14.
- [ ] A desktop DM client is completely unaffected: default sheets, sidebar, and the world's sheet-class settings are unchanged.
- [ ] A player owning multiple supported actors sees the actor selector and tapping one opens its mobile sheet.
- [ ] A player owning exactly one supported actor skips the selector and opens straight into it.
- [ ] Closing the sheet leaves a reachable way back (FAB) without using the desktop UI.
- [ ] `activation: never` suppresses auto-open; `always` forces it; `auto` follows detection.
- [ ] No duplicate sheet windows for the same actor.
- [ ] Phase 3 reads no `actor.system` (only `name`/`img`/`id`/`type` + adapter `actorTypes`); system firewall holds.
- [ ] No console errors when the client owns no actors, or the system has no adapter.
