/**
 * Mobile Sheet — adapter contract (Phase 0).
 *
 * JSDoc typedefs only. No runtime logic lives here. This file is the single
 * source of truth for the interface every system adapter implements and the
 * normalized view model the shell renders. See specs/phase-0-foundations.md.
 *
 * Two halves:
 *   - read: `getViewModel(actor)` is PURE — actor -> ViewModel, no DOM, no writes.
 *   - act:  `invoke(actor, intent)` delegates each intent to the system's own
 *           document methods (rolls / item use / update). The shell never owns
 *           dice math, chat formatting, or sync — those stay with Foundry/system.
 */

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * @typedef {object} MobileSheetAdapter
 * @property {string}   systemId   Must equal `game.system.id` to be selected.
 * @property {string[]} actorTypes Actor types this adapter renders, e.g. ["character"].
 * @property {() => AdapterAvailability} checkAvailability
 *   Inspect `game.system.version` / presence of expected APIs. Cheap,
 *   side-effect-free, never throws. Gates the shell's "unsupported" state.
 * @property {(actor: Actor) => ViewModel} getViewModel
 *   PURE: no async, no DOM, no writes. Safe to call on every render. Reads
 *   defensively (optional chaining + fallbacks) so cross-version data drift
 *   degrades gracefully instead of throwing.
 * @property {(actor: Actor, intent: Intent) => Promise<void>} invoke
 *   Translate an abstract intent into the system's own method. Delegates —
 *   never reimplements dice, chat, or sync. Unknown intent types: no-op.
 */

/**
 * Result of `checkAvailability`. `ok:false` carries a player-readable reason
 * the shell shows in its "unsupported" state.
 * @typedef {{ ok: true } | { ok: false, reason: string }} AdapterAvailability
 */

// ---------------------------------------------------------------------------
// Intents (shell -> adapter). Keep the set small and additive.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Intent
 * @property {"rollStat"|"useItem"|"adjustResource"|"openItem"} type
 * @property {string} [key]    Stat key (rollStat) or resource key (adjustResource).
 * @property {string} [itemId] Item id (useItem / openItem).
 * @property {number} [delta]  Resource step (adjustResource), e.g. +1 / -1.
 * @property {Event}  [event]  Forwarded DOM event for modifier-key / dialog behavior.
 */

// ---------------------------------------------------------------------------
// Normalized view model (system-agnostic). The shell renders only this.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ViewModel
 * @property {Identity} identity
 * @property {Block[]}  blocks   Ordered; shell renders top-to-bottom.
 */

/**
 * @typedef {object} Identity
 * @property {string} name
 * @property {string} img
 * @property {string} [subtitle] e.g. "Level 2 Guardian".
 */

/**
 * @typedef {ResourceBlock|StatGridBlock|ActionListBlock|InfoBlock} Block
 */

/**
 * A tappable resource with a stepper and optional bar (HP, Stress, Hope, ...).
 * @typedef {object} ResourceBlock
 * @property {"resource"} kind
 * @property {string} key            Used by the adjustResource intent.
 * @property {string} label          Display-ready (adapter-localized).
 * @property {number} value
 * @property {number|null} max       null -> shell renders a maxless stepper (no bar).
 * @property {boolean} [editable]    Show the +/- stepper.
 */

/**
 * A grid of stats; rollable entries are tappable (traits / abilities).
 * @typedef {object} StatGridBlock
 * @property {"statGrid"} kind
 * @property {StatEntry[]} stats
 *
 * @typedef {object} StatEntry
 * @property {string} [key]          Stat key for the rollStat intent (rollable only).
 * @property {string} label          Display-ready.
 * @property {number|string} value
 * @property {boolean} rollable
 */

/**
 * A list of usable items (weapons, spells, features, domain cards).
 * @typedef {object} ActionListBlock
 * @property {"actionList"} kind
 * @property {string} title          Display-ready.
 * @property {ActionItem[]} items
 *
 * @typedef {object} ActionItem
 * @property {string} itemId
 * @property {string} name
 * @property {string} [img]
 * @property {string} [subtitle]
 */

/**
 * Read-only text (notes, experiences).
 * @typedef {object} InfoBlock
 * @property {"info"} kind
 * @property {string} title          Display-ready.
 * @property {string} html           Pre-enriched AND escaped by the adapter (safe).
 */

export {};
