# Research Notes — API grounding

Facts gathered from real sources to ground the specs. Not implementation. Verify again at spec time (systems drift).

---

## Foundry core (the "free" layer)

The whole "shared map + private mobile sheets + live sync" requirement is satisfied by core. The module only renders a mobile sheet.

- **Sheets** register via `foundry.documents.collections.Actors.registerSheet(...)` and `foundry.applications.apps.DocumentSheetConfig.registerSheet/unregisterSheet`.
- **Sheet base class**: `foundry.applications.sheets.ActorSheetV2` (+ `HandlebarsApplicationMixin` from `foundry.applications.api`). Stable and unchanged across v13 → v14, so the shell needs no version branching. Target compat: min `13`, verified `14`.
- **Sync**: editing an Actor document propagates to all clients automatically (`updateActor` hook). No module sync code.
- **Rolls**: posting through a system's roll API lands in shared chat + triggers DiceSoNice automatically.
- **Mobile detection**: no core helper. Must derive from viewport width / touch (pattern used by swipe-vtt). → its own spec in Phase 3.

---

## Daggerheart (Foundryborne) — first adapter target

- System id: `daggerheart`. Version 2.4.1. **Foundry min 14.364** (so module's practical floor is v14 when this system is in play).
- Exposes a global API object at **`game.system.api`** → `{ applications, data, models, documents, macros, dice, fields }`.
- Roll classes registered at **`CONFIG.Dice.daggerheart`** → `{ DHRoll, DualityRoll, D20Roll, DamageRoll, FateRoll }`.
- Actor document class auto-selects DualityRoll for `character`/`companion`.

### Read — view model from `actor.system`
- `resources.hitPoints` → `{ value, max }`
- `resources.stress` → `{ value, max }`
- `resources.hope` → `{ value, max }`
  (resources are a custom `ResourcesField`; entries shaped `{ value, max }`, `max` may be `null` = default.)
- `traits.{agility, strength, finesse, instinct, presence, knowledge}` → each has `.value`
- `evasion`, `proficiency`
- `damageThresholds.{ major, severe }`
- `experiences` (typed object: `{ name, value, description, core }`)
- `actor.items` filtered by `type`: `weapon`, `armor`, `domainCard`, `feature`, `consumable`, `loot`, `ancestry`, `community`, `class`, `subclass`, `beastform`

### Write / actions — delegate to the system (never reimplement dice)
- **Trait check (duality roll)**: `await actor.rollTrait(traitKey, options)` — internally builds a DualityRoll, posts to chat.
- **Use weapon / feature / domain card**: `await item.use(event)`.
- **Adjust resources** (HP/Stress/Hope steppers): `await actor.update({ 'system.resources.hitPoints.value': n })` (same for `stress` / `hope`).
- Lower-level if needed: `actor.diceRoll(config)` (what `rollTrait` calls).

### Actor types present
`character, companion, adversary, npc, environment, party`. v1 mobile sheet targets `character` (player-facing).

---

## dnd5e — second adapter target (Phase 4)

Not yet researched in depth — deferred to its own spec. Known shape (verify at spec time):
- `actor.system.attributes.hp` `{ value, max, temp }`, `attributes.ac.value`
- `actor.system.abilities.{str,dex,...}`
- Rolls via actor/item APIs (e.g. ability checks, `item.use()`), all posting to shared chat.

---

## Implication for the adapter contract

The Daggerheart data confirms a clean split the contract can rely on:

- **Read** = a pure function `actor.system → view model` (no DOM, no side effects).
- **Write** = a small set of named intents that delegate to the document's own methods (`rollTrait`, `item.use`, `actor.update`).

Because writes delegate, the module never owns dice math, chat formatting, or sync — those stay with the system and Foundry core. That is what keeps the module small and each adapter thin.
