# Spec — Phase 0: Foundations & Adapter Contract

Status: draft · Depends on: nothing · Blocks: all later phases

Defines the project skeleton and the **adapter contract** — the single interface that makes the module system-agnostic and community-extensible. This is the crux of the whole design; later phases implement against it.

No application logic is built in Phase 0. Output is: repo scaffold, `module.json`, the contract definition, the adapter registry mechanism, and the normalized view-model schema.

---

## 1. Deliverables

1. Repo scaffold + MIT `LICENSE`, `README.md`, `CONTRIBUTING.md`.
2. `module.json` (compat min 13 / verified 14; no build deps; no socketlib).
3. Directory layout (below).
4. **Adapter contract** — interface + the normalized view-model schema.
5. **Adapter registry** — how an adapter registers itself (the extension point).
6. Acceptance criteria met (§9).

Not in scope: the shell sheet (Phase 1), any concrete adapter (Phase 2+), mobile detection / selector (Phase 3).

---

## 2. Directory layout

```
pocket-sheet/
  module.json
  LICENSE                  # MIT
  README.md
  CONTRIBUTING.md          # incl. "how to write an adapter"
  scripts/
    main.js                # entry: init hook, registry bootstrap, sheet registration
    registry.js            # adapter registry (register / resolve by system id)
    contract.js            # JSDoc typedefs for the contract + view model (no logic)
  adapters/
    daggerheart.js         # Phase 2
    dnd5e.js               # Phase 4
  templates/
    sheet.hbs              # Phase 1 shell template
    blocks/                # Phase 1 block partials
  styles/
    pocket-sheet.css       # mobile-first base
  lang/
    en.json
```

Plain ESM. No bundler. Foundry loads `scripts/*.js`, `.hbs`, lang JSON natively.

---

## 3. `module.json` (shape)

```jsonc
{
  "id": "pocket-sheet",
  "title": "Pocket Sheet",
  "description": "Mobile-friendly character sheets for in-person play.",
  "compatibility": { "minimum": "13", "verified": "14" },
  "esmodules": ["scripts/main.js"],
  "styles": ["styles/pocket-sheet.css"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }]
  // no "relationships.requires" — zero hard deps
}
```

System-specific behavior is gated at runtime by `game.system.id`, not by manifest relationships — keeps the module installable everywhere and inert where no adapter exists.

---

## 4. The adapter contract

An adapter is a plain object implementing this interface for one system. It is the **only** place system knowledge lives. Two halves: **read** (pure, `actor → view model`) and **act** (named intents that delegate to the system).

### 4.1 Interface

```js
/**
 * @typedef {object} PocketSheetAdapter
 * @property {string}   systemId        // must equal game.system.id to be selected
 * @property {string[]} actorTypes      // actor types this adapter renders, e.g. ["character"]
 *
 * // --- availability (cross-version safety, see ROADMAP §Target) ---
 * @property {() => AdapterAvailability} checkAvailability
 *     // inspect game.system.version / presence of expected APIs; returns ok or a reason
 *
 * // --- read: pure, no DOM, no side effects ---
 * @property {(actor: Actor) => ViewModel} getViewModel
 *
 * // --- act: named intents; each delegates to the system, never reimplements dice ---
 * @property {(actor: Actor, intent: Intent) => Promise<void>} invoke
 */

/** @typedef {{ ok: true } | { ok: false, reason: string }} AdapterAvailability */
```

### 4.2 Intents

The shell never calls system methods directly. It emits abstract intents; the adapter translates. Keep the set small and additive.

```js
/**
 * @typedef {object} Intent
 * @property {"rollStat"|"useItem"|"adjustResource"|"openItem"} type
 * @property {string} [key]        // stat key (rollStat) or resource key (adjustResource)
 * @property {string} [itemId]     // useItem / openItem
 * @property {number} [delta]      // adjustResource (+1 / -1)
 * @property {Event}  [event]      // forwarded for modifier-key / dialog behavior
 */
```

Daggerheart mapping (validates the design, from RESEARCH.md):
- `rollStat{key}` → `actor.rollTrait(key, { event })`
- `useItem{itemId}` → `actor.items.get(itemId).use(event)`
- `adjustResource{key, delta}` → `actor.update({ ['system.resources.'+key+'.value']: clamp(current+delta) })`
- `openItem{itemId}` → `item.sheet.render(true)`

### 4.3 Boundary rules

- Adapter `getViewModel` is **pure** — no async, no DOM, no writes. Safe to call on every render.
- All mutation/dice go through `invoke`, which **delegates** to document methods → chat, DiceSoNice, and sync stay with Foundry/system.
- Adapter reads **defensively** (optional chaining + fallbacks) so a system's v13-vs-v14 data shape differences degrade gracefully rather than throw.

---

## 5. Normalized view model (system-agnostic)

The shell renders a generic, block-based model. Any system maps onto these block types; new systems need no new shell code.

```js
/**
 * @typedef {object} ViewModel
 * @property {Identity} identity
 * @property {Block[]}  blocks       // ordered; shell renders top-to-bottom
 *
 * @typedef {object} Identity
 * @property {string} name
 * @property {string} img
 * @property {string} [subtitle]     // e.g. "Level 2 Guardian" / class+heritage
 *
 * @typedef {ResourceBlock|StatGridBlock|ActionListBlock|InfoBlock} Block
 *
 * // a tappable resource w/ stepper + optional bar (HP, Stress, Hope, ...)
 * @typedef {object} ResourceBlock
 * @property {"resource"} kind
 * @property {string} key            // used by adjustResource intent
 * @property {string} label
 * @property {number} value
 * @property {number|null} max
 * @property {boolean} [editable]    // show +/- stepper
 *
 * // grid of rollable stats (traits / abilities)
 * @typedef {object} StatGridBlock
 * @property {"statGrid"} kind
 * @property {{ key:string, label:string, value:number|string, rollable:boolean }[]} stats
 *
 * // list of usable items (weapons, spells, features, domain cards)
 * @typedef {object} ActionListBlock
 * @property {"actionList"} kind
 * @property {string} title
 * @property {{ itemId:string, name:string, img?:string, subtitle?:string }[]} items
 *
 * // read-only text (notes, experiences)
 * @typedef {object} InfoBlock
 * @property {"info"} kind
 * @property {string} title
 * @property {string} html           // pre-enriched/escaped by adapter
 */
```

Block set is intentionally minimal. Adding a block type is a deliberate, shell-touching change reviewed for cross-system value — most systems should fit the existing four.

---

## 6. Adapter registry (extension point)

```js
// scripts/registry.js — shape
const adapters = new Map();              // systemId -> adapter
export function register(adapter) { adapters.set(adapter.systemId, adapter); }
export function resolve(systemId) { return adapters.get(systemId) ?? null; }
```

- Built-in adapters self-register on `init`.
- Community/third-party modules register via the public API (`game.modules.get("pocket-sheet").api.register(adapter)`) **or** by listening for the `pocketSheet.ready` hook (fired with the api), so a new system = one external file, **zero core changes** and **no load-order coupling**.
- If `resolve(game.system.id)` is `null`, or `checkAvailability().ok === false`, the module stays inert / shows a graceful unsupported state (no registration of the mobile sheet, or a stub sheet with the reason).

---

## 7. Cross-version handling (v13 + v14)

- Shell uses only ApplicationV2 / ActorSheetV2 APIs (identical across v13→v14) — no branching.
- Per-system data drift is contained in adapters via §4.3 defensive reads + §4.1 `checkAvailability`.
- `checkAvailability` is the seam where an adapter can refuse a system version it can't read, surfacing a message instead of crashing.

---

## 8. Decisions & open questions

Decided:
1. **Registration** — expose `game.modules.get("pocket-sheet").api.register(adapter)` **and** fire a `pocketSheet.ready` hook (passing the registry/api) so third-party adapters register regardless of module load order.
2. **Localization** — the adapter returns **display-ready strings** in the view model (it owns its system's vocabulary, e.g. "Hope", "Agility"). The shell never resolves system i18n keys.

Still open (resolve before/with Phase 1):
3. View-model build cost — pure rebuild every render is simplest; revisit only if profiling shows a problem.

---

## 9. Acceptance criteria

- [ ] Repo scaffold + MIT license + README + contributing guide exist.
- [ ] `module.json` installs on both v13 and v14 with no errors and no hard deps.
- [ ] `contract.js` documents the adapter interface, intents, and view-model typedefs (no logic).
- [ ] `registry.js` supports register/resolve; public `register` reachable via module API.
- [ ] With no adapter for the active system, the module loads inert (no console errors).
- [ ] CONTRIBUTING explains, end-to-end, how to add a system adapter against this contract.
