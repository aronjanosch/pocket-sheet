# Spec — Phase 1: Core Shell

Status: draft · Depends on: Phase 0 (adapter contract) · Blocks: Phase 2 (Daggerheart adapter)

The system-agnostic mobile sheet. A registered `ActorSheetV2` that renders the normalized view model from Phase 0 and turns taps into intents. Contains **zero system knowledge** — all of that lives in adapters.

Phase 1 is testable without a real adapter via a throwaway **stub adapter** (returns one of each block kind). The first real adapter is Phase 2.

---

## 1. Deliverables

1. `MobileSheet` shell class (`ActorSheetV2` + `HandlebarsApplicationMixin`).
2. `templates/sheet.hbs` + four block partials.
3. Intent dispatch (DOM → `Intent` → `adapter.invoke`).
4. Live re-render on actor change.
5. Unsupported / no-adapter / empty states.
6. Mobile-first CSS base.
7. A stub adapter (dev-only) to exercise rendering.
8. Acceptance criteria (§10).

Not in scope: auto-detect / actor selector (Phase 3); any concrete system mapping (Phase 2+).

---

## 2. Shell class

```
MobileSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2)
```

Responsibilities, in order, per render:

1. Resolve adapter: `registry.resolve(game.system.id)`.
2. If none → render **no-adapter** state.
3. `adapter.checkAvailability()`; if `!ok` → render **unsupported** state with `reason`.
4. `vm = adapter.getViewModel(this.actor)` (pure; see Phase 0 §4.3).
5. Hand `vm` to the template.

The shell only ever sees `ViewModel` — never `actor.system` directly. This is the firewall that keeps it system-agnostic.

### Registration (Phase 1 scope)

- Register as a **selectable, non-default** Actor sheet for the adapter's `actorTypes` (`Actors.registerSheet`, `makeDefault: false`). Users opt in via the sheet-config dropdown.
- Auto-presenting it on mobile is **Phase 3** — explicitly not here. Phase 1 is validated by manually selecting the sheet.

---

## 3. Render data + template

`_prepareContext` returns:

```js
{
  state: "ok" | "no-adapter" | "unsupported" | "empty",
  reason,                 // unsupported only
  identity,               // ViewModel.identity (state ok)
  blocks                  // ViewModel.blocks (state ok)
}
```

`sheet.hbs` switches on `state`. For `ok`: render `identity` header, then iterate `blocks`, dispatching each to the partial named by `block.kind`.

```hbs
{{#each blocks}}
  {{#if (eq kind "resource")}}   {{> blocks/resource}}{{/if}}
  {{#if (eq kind "statGrid")}}   {{> blocks/statGrid}}{{/if}}
  {{#if (eq kind "actionList")}} {{> blocks/actionList}}{{/if}}
  {{#if (eq kind "info")}}        {{> blocks/info}}{{/if}}
{{/each}}
```

### Block partial contracts (what each renders + emits)

| Partial | Renders | Emits intent |
|---|---|---|
| `resource` | label, `value/max`, optional bar, +/- stepper if `editable` | `adjustResource{key, delta:±1}` |
| `statGrid` | grid of stats; `rollable` ones are tappable | `rollStat{key}` |
| `actionList` | `title` + tappable item rows (img, name, subtitle) | tap → `useItem{itemId}`; long-press/secondary → `openItem{itemId}` |
| `info` | `title` + pre-enriched `html` (adapter-supplied, already safe) | none |

Partials carry `data-action` + `data-key`/`data-item-id`/`data-delta` for dispatch (§4).

---

## 4. Intent dispatch

ApplicationV2 `actions` (or a delegated listener in `_onRender`) map `data-action` → handler. Each handler builds an `Intent` from the element's data attributes and calls:

```js
await adapter.invoke(this.actor, intent);   // forward the DOM event for modifier keys
```

The shell does **not** mutate the actor or roll itself — `invoke` delegates to the system (Phase 0 §4.2/4.3). Optimistic UI not needed; rely on the re-render in §5.

---

## 5. Live re-render

- Listen for the core `updateActor` hook; if the updated actor is this sheet's actor, re-render.
- This is how a DM-side change, another player, or the adapter's own `invoke` flows back into the view — **no module sync**, core does it.
- Items: re-render on embedded item create/update/delete for this actor (`updateItem` et al. scoped to `actor`).

---

## 6. States

- **no-adapter**: system unsupported. Brief message: "No mobile sheet for `<system>` yet" + link to contributing. Sheet still opens (doesn't throw).
- **unsupported**: adapter exists but `checkAvailability()` failed (e.g. system version too old/new). Show `reason`.
- **empty**: `ok` but `blocks` empty → friendly placeholder.
- **ok**: normal render.

All states are non-fatal — opening the sheet never errors regardless of system/version.

---

## 7. CSS (mobile-first)

- Single column, `100dvh`, safe-area insets.
- Min tap target 44px; steppers/roll targets generous.
- Bars/steppers styled generically (no system theming in Phase 1).
- Desktop: cap width (e.g. `max-width` centered) so it's usable if selected on desktop too.
- One stylesheet; CSS custom properties for the few colors so adapters/themes can override later.

---

## 8. Stub adapter (dev only)

A minimal adapter registered only when a dev flag is set, returning a static `ViewModel` with one of each block kind and `invoke` logging the intent. Lets Phase 1 be built + reviewed before Phase 2. Not shipped / not registered in normal runtime.

---

## 9. Open questions

1. Stepper granularity — ±1 only in v1, or long-press to open a set-value dialog? Leaning ±1 only (simplest); dialog deferrable.
2. Whether `actions` map (ApplicationV2 native) covers long-press/secondary for `openItem`, or needs a manual gesture listener. Resolve during build.

---

## 10. Acceptance criteria

- [ ] Selecting "Mobile Sheet" on a character opens the shell on both v13 and v14.
- [ ] With the stub adapter, all four block kinds render correctly on a phone-width viewport.
- [ ] Tapping a rollable stat / item / stepper dispatches the correct `Intent` to `adapter.invoke` (verified via stub logging).
- [ ] Editing the actor elsewhere re-renders the open sheet live.
- [ ] no-adapter / unsupported / empty states render without console errors.
- [ ] Shell references no `actor.system` field directly (system firewall holds).
