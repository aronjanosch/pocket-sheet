# Spec — Phase 2: First Adapter (Daggerheart)

Status: draft · Depends on: Phase 0 (adapter contract) + Phase 1 (core shell) · Blocks: Phase 4 (dnd5e adapter — hardens the contract from two implementations)

The first real adapter: one file, `adapters/daggerheart.js`, implementing the Phase 0 `PocketSheetAdapter` interface for the Daggerheart (Foundryborne) system. It maps `actor.system` → the normalized view model and translates the four intents into Daggerheart's own document methods. It contains **all** Daggerheart knowledge; the shell stays system-agnostic.

This phase validates the abstraction against a real, opinionated system. If a clean adapter can be written with **zero shell changes**, the Phase 0 contract holds. Any shell change forced here is a contract defect to log (§9), not to patch silently.

---

## 1. Deliverables

1. `adapters/daggerheart.js` — adapter object implementing `systemId`, `actorTypes`, `checkAvailability`, `getViewModel`, `invoke`.
2. Self-registration on `init` (via the registry / `pocketSheet.ready`, Phase 0 §6).
3. Read mapping: HP / Stress / Hope resources, six traits, derived stats, action lists, experiences → view-model blocks (§4).
4. Act mapping: the four intents delegated to `rollTrait` / `item.use` / `actor.update` / `item.sheet.render` (§5).
5. Defensive reads + `checkAvailability` covering the v13-vs-v14 / pre-2.x data drift (§6).
6. Display-ready strings (adapter owns Daggerheart vocabulary; §7).
7. Acceptance criteria (§10).

Not in scope: shell/template changes (Phase 1 owns those), mobile auto-detect / actor selector (Phase 3), any non-`character` actor type, theming.

---

## 2. Identity & scope

```js
systemId:   "daggerheart"
actorTypes: ["character"]            // v1 player-facing only
```

Other Daggerheart actor types (`companion`, `adversary`, `npc`, `environment`, `party`) are out of scope for v1 — the shell simply won't offer the mobile sheet for them (Phase 1 registers per `actorTypes`).

---

## 3. `checkAvailability()` — the version seam

Daggerheart drifts hard across versions: 2.4.1 requires Foundry v14, and earlier releases that ran on v13 differ in data shape and may lack `rollTrait`. This is exactly the cross-version risk the ROADMAP isolates in adapters. `checkAvailability` is where the adapter refuses what it can't read, surfacing a `reason` the shell shows as the **unsupported** state (Phase 1 §6) instead of throwing.

Returns `{ ok: true }` only when all hold (read defensively, each guarded):

1. `game.system.id === "daggerheart"` (sanity; registry already keyed on it).
2. The write API exists: `typeof actor?.rollTrait === "function"` **and** the duality roll is registered: `CONFIG.Dice?.daggerheart?.DualityRoll` present.
3. System version is a known-good major: `game.system.version` satisfies `>= 2.0.0` (the line where `system.resources.*` + `rollTrait` are confirmed; RESEARCH.md). Below that → not-ok.

On failure return `{ ok: false, reason }` with a player-readable, adapter-localized message, e.g. _"Requires Daggerheart 2.x — your version is older."_ or _"This Daggerheart version isn't supported by Pocket Sheet yet."_ Never throw from `checkAvailability`.

> `checkAvailability` is consulted once per render before `getViewModel` (Phase 1 §2). It must be cheap and side-effect-free.

---

## 4. `getViewModel(actor)` — read mapping (pure)

Pure, synchronous, no DOM, no writes (Phase 0 §4.3). Every field read with optional chaining + fallback; a missing field drops its block rather than throwing. Returns `{ identity, blocks }`.

### 4.1 Identity

```js
identity = {
  name:     actor.name,
  img:      actor.img,
  subtitle: <derived>          // optional
}
```

`subtitle` is assembled defensively from the character's class/subclass items + level, e.g. `"Level 2 · Warrior (Call of the Brave)"`:
- class name ← first item of type `class` (`.name`); subclass ← first `subclass`.
- level ← `actor.system.level?.value ?? actor.system.level` (shape unconfirmed — read both, fall back to omitting the level segment).
- If none resolve, omit `subtitle` entirely (Identity allows it).

### 4.2 Blocks (ordered, top-to-bottom)

Order is chosen for thumb reach on a phone: vitals first, then dice, then actions, then reference.

| # | Block kind | Source | Notes |
|---|---|---|---|
| 1 | `resource` | `system.resources.hitPoints` | label `"HP"`, `editable: true` |
| 2 | `resource` | `system.resources.stress` | label `"Stress"`, `editable: true` |
| 3 | `resource` | `system.resources.hope` | label `"Hope"`, `editable: true` |
| 4 | `statGrid` | `system.traits.*` + derived | six rollable traits + non-rollable derived stats |
| 5 | `actionList` | items `type === "weapon"` | title `"Weapons"` (prefer equipped; §4.4) |
| 6 | `actionList` | items `type === "domainCard"` | title `"Domain Cards"` |
| 7 | `actionList` | items `type === "feature"` | title `"Features"` |
| 8 | `actionList` | items `type === "consumable"` | title `"Consumables"` |
| 9 | `info` | `system.experiences` | title `"Experiences"`, read-only |

Empty lists are omitted (don't emit an `actionList` with zero items — the shell's empty state is per-sheet, not per-block).

### 4.3 Resource blocks

Each resource → `{ kind:"resource", key, label, value, max, editable:true }`.

- `key` is the **resource segment** used by the `adjustResource` intent and rebuilt into the update path in §5: `"hitPoints"`, `"stress"`, `"hope"`.
- `value` ← `res.value ?? 0`.
- `max` ← effective max via `resolveMax(key, res)` (§4.5). May still be `null` if unknown — `ResourceBlock.max` is `number|null`, and the shell renders a stepper without a bar when `max == null`.

### 4.4 Stat grid (traits + derived)

`stats` array, in this order:

- Six traits — `agility, strength, finesse, instinct, presence, knowledge`:
  `{ key, label, value: system.traits[key]?.value ?? 0, rollable: true }`.
  `label` is the adapter-localized trait name (`"Agility"`, …; §7). `key` is the raw trait key passed straight to `rollTrait`.
- Derived, non-rollable (`rollable: false`, no `key` needed): `Evasion` ← `system.evasion`, `Proficiency` ← `system.proficiency`. Damage thresholds (`system.damageThresholds.{major,severe}`) render as one non-rollable entry `"Thresholds"` with value `"<major>/<severe>"` (read defensively; omit if absent).

Only `rollable:true` entries are tappable in the shell and emit `rollStat` (Phase 1 §3 table).

### 4.5 `resolveMax(key, res)` helper

Daggerheart's `ResourcesField` stores `max: null` to mean "use the system default" (RESEARCH.md). For a usable stepper/bar the adapter resolves an effective max:

1. If `res.max` is a number → use it.
2. Else fall back to adapter-known defaults: **Stress → 6**, **Hope → 6**, **HP → derived** (level/threshold-based).
3. If still unknown → return `null` (shell shows a maxless stepper; §4.3).

> The exact default values + HP derivation are **verify-at-build** against the installed Daggerheart version (prepared data may already fill `max`). Treat the numbers above as provisional; the contract only requires "a number or null."

### 4.6 Experiences info block

`system.experiences` is a typed object of `{ name, value, description, core }`. Render as one `info` block: title `"Experiences"`, `html` = an adapter-built, **already-safe** list (e.g. `"<ul><li>+2 Silver Tongue</li>…</ul>"`), names/text escaped by the adapter (Phase 0: `info.html` is adapter-supplied and safe). Omit the block if there are no experiences.

> Experiences in Daggerheart are roll *modifiers*, not standalone rolls. v1 shows them read-only. Making them tappable to add their bonus to a pending roll is a future enhancement, not Phase 2 (§9).

---

## 5. `invoke(actor, intent)` — act mapping (delegating)

Async. Every branch **delegates** to a Daggerheart/Foundry method — the adapter never builds a Roll, formats chat, or writes sync data itself. Unknown `intent.type` → no-op (defensive; forward-compatible with new intents).

```js
switch (intent.type) {
  case "rollStat":        // tap a trait
    return actor.rollTrait(intent.key, { event: intent.event });

  case "useItem":         // tap a weapon / card / feature / consumable
    return actor.items.get(intent.itemId)?.use?.(intent.event);

  case "adjustResource":  // +/- stepper
    return adjustResource(actor, intent.key, intent.delta);

  case "openItem":        // long-press / secondary
    return actor.items.get(intent.itemId)?.sheet?.render(true);

  default:
    return;               // unknown intent → ignore
}
```

`adjustResource` clamps before writing, building the path from the resource segment:

```js
function adjustResource(actor, key, delta) {
  const res  = actor.system?.resources?.[key];
  if (!res) return;
  const max  = resolveMax(key, res);                 // §4.5, may be null
  const next = clamp((res.value ?? 0) + delta, 0, max); // lower 0; upper max if known, else no upper bound
  return actor.update({ [`system.resources.${key}.value`]: next });
}
```

- `rollTrait` internally builds the DualityRoll and posts to shared chat (→ DiceSoNice for free). The adapter passes the raw trait key + forwards the event for the system's own modifier-key / dialog behavior.
- `item.use(event)` owns weapon/card/feature/consumable resolution (attack rolls, costs, chat cards). Guarded with `?.` so an item lacking `use` is a no-op, not a crash.
- All three mutate paths feed the live re-render via the core `updateActor` / `updateItem` hooks (Phase 1 §5) — the adapter triggers no re-render itself.

---

## 6. Cross-version & defensive reads (v13 + v14)

- **Single seam, then trust:** `checkAvailability` (§3) gates the major version up front; past it, `getViewModel` still reads every field with `?.`/`??` so a renamed/absent sub-field degrades (drops a block, shows `0`) rather than throws.
- **Resource shape:** treat `res.max == null` as "default" (§4.5), never as `0`.
- **Item `use`/`sheet`:** optional-chained in `invoke` (§5) — older item documents missing these no-op.
- The adapter assumes **nothing** about Foundry version directly; it keys off `game.system.version` + presence of `rollTrait`/`CONFIG.Dice.daggerheart`. That keeps it correct whether Daggerheart 2.x is running on v13 or v14.

---

## 7. Localization (adapter owns Daggerheart vocabulary)

Per Phase 0 §8 decision 2, the adapter returns **display-ready strings**; the shell never resolves system i18n keys. The adapter localizes via the `pocket-sheet` lang files (its own namespace), e.g. `MOBILE_SHEET.daggerheart.trait.agility`, `…resource.hope`, `…stat.evasion`, `…list.weapons`. Raw keys (`agility`, `hitPoints`) stay internal — used only as intent/update keys, never shown.

New `lang/en.json` entries for: 3 resource labels, 6 trait names, derived-stat labels (Evasion, Proficiency, Thresholds), 4 list titles, Experiences title, and the `checkAvailability` failure messages.

---

## 8. Files touched

| File | Change |
|---|---|
| `adapters/daggerheart.js` | **new** — the adapter (the whole phase) |
| `lang/en.json` | add Daggerheart display strings (§7) |
| `scripts/main.js` | confirm built-in adapters are imported so they self-register on `init` (no logic change if Phase 1 already wires this) |

No shell, template, or CSS changes expected. If any prove necessary, that is a Phase 0/1 contract gap — record it in §9 rather than editing the shell to fit Daggerheart.

---

## 9. Open questions & contract-feedback log

Resolve during build; anything that forced a shell change is contract feedback to carry into Phase 4.

1. **Effective `max` for null resources** — confirm whether prepared `actor.system.resources.*.max` is already filled by the system (making §4.5 fallbacks dead code) or genuinely `null` at read time. Verify Stress/Hope defaults and the HP derivation against the installed version.
2. **Weapon list filtering** — show all weapons or only equipped (`system.equipped`)? Lean equipped-only to keep the action list short on a phone; verify the equipped flag's location.
3. **`level` shape** — `system.level.value` vs `system.level` (§4.1); read both, never block identity on it.
4. **Experiences as roll modifiers** — read-only in v1 (§4.6). Tappable "apply experience to roll" is a candidate Phase 5 enhancement; note if the contract would need a new intent.
5. **Domain card "use" semantics** — confirm `item.use()` is the right call for `domainCard` (vs an action/ability sub-document). If domain cards need a different method, that's adapter-internal, not a contract change.

---

## 10. Acceptance criteria

- [ ] On a Daggerheart `character`, selecting "Pocket Sheet" renders HP, Stress, Hope (with steppers), the six traits, derived stats, weapons/domain cards/features/consumables, and experiences — on a phone-width viewport.
- [ ] Tapping a trait posts a Daggerheart **duality roll** to shared chat (via `rollTrait`); the adapter builds no Roll itself.
- [ ] Tapping a weapon / domain card / feature / consumable triggers the system's `item.use` (its normal chat card / attack).
- [ ] +/- on HP / Stress / Hope updates `system.resources.<key>.value`, clamped to `[0, max]` (lower bound enforced even when `max` is unknown), and the sheet re-renders live.
- [ ] Long-press / secondary on an action item opens that item's own sheet (`openItem`).
- [ ] On an unsupported Daggerheart version (pre-2.x / `rollTrait` absent), the sheet shows the **unsupported** state with the adapter's `reason` — no console errors.
- [ ] Adapter touches **no** shell/template/CSS file; the Phase 1 shell renders it through the view model alone (system firewall holds). Any deviation logged in §9.
- [ ] All player-visible strings come from `pocket-sheet` lang files (no raw system keys shown).
- [ ] Works identically whether Daggerheart 2.x runs on Foundry v13 or v14.
```