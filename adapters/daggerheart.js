/**
 * Mobile Sheet — Daggerheart (Foundryborne) adapter (Phase 2).
 *
 * The only place Daggerheart knowledge lives. Two halves:
 *   - read: getViewModel(actor) is PURE — maps actor.system → normalized blocks.
 *   - act:  invoke(actor, intent) DELEGATES to the system (rollTrait / item.use /
 *           actor.update). Never builds a Roll, formats chat, or writes sync.
 *
 * Reads defensively (optional chaining + fallbacks) so v13-vs-v14 / pre-2.x data
 * shape drift degrades gracefully. See specs/phase-2-daggerheart-adapter.md.
 *
 * @typedef {import("../scripts/contract.js").MobileSheetAdapter} MobileSheetAdapter
 */

const SYSTEM_ID = "daggerheart";
const MIN_VERSION = "2.0.0";

/** Daggerheart's six traits, in display order. Keys pass straight to rollTrait. */
const TRAITS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

/** Fallback resource maxes when the field stores `max: null` (= system default). */
const RESOURCE_MAX_DEFAULTS = { stress: 6, hope: 6 };

/** Localize an adapter string. The adapter owns Daggerheart vocabulary. */
const L = (suffix) => game.i18n.localize(`MOBILE_SHEET.daggerheart.${suffix}`);

/** Unwrap a value that may be a bare number or a `{ value }` object. */
const num = (x) => (x && typeof x === "object" ? x.value : x);

// --- helpers ----------------------------------------------------------------

/**
 * Effective max for a resource. `ResourcesField` stores `max: null` to mean
 * "use the system default" (RESEARCH.md). Verify-at-build: prepared data may
 * already fill `.max`, and the HP derivation/defaults need confirming against
 * the installed version.
 */
function resolveMax(key, res) {
  if (typeof res?.max === "number") return res.max;
  return RESOURCE_MAX_DEFAULTS[key] ?? null; // HP / unknown → maxless stepper
}

function clamp(n, min, max) {
  n = Math.max(min, n);
  if (typeof max === "number") n = Math.min(max, n);
  return n;
}

function resourceBlock(actor, key) {
  const res = actor.system?.resources?.[key];
  if (!res) return null;
  return {
    kind: "resource",
    key,
    label: L(`resource.${key}`),
    value: res.value ?? 0,
    max: resolveMax(key, res),
    editable: true
  };
}

function statGridBlock(actor) {
  const sys = actor.system ?? {};
  const stats = TRAITS.map((key) => ({
    key,
    label: L(`trait.${key}`),
    value: num(sys.traits?.[key]?.value ?? sys.traits?.[key]) ?? 0,
    rollable: true
  }));

  const evasion = num(sys.evasion);
  if (evasion != null) stats.push({ label: L("stat.evasion"), value: evasion, rollable: false });

  const proficiency = num(sys.proficiency);
  if (proficiency != null) stats.push({ label: L("stat.proficiency"), value: proficiency, rollable: false });

  const dt = sys.damageThresholds;
  if (dt && (dt.major != null || dt.severe != null)) {
    stats.push({ label: L("stat.thresholds"), value: `${dt.major ?? "—"}/${dt.severe ?? "—"}`, rollable: false });
  }

  return { kind: "statGrid", stats };
}

function itemListBlock(actor, type, titleKey) {
  const items = (actor.items?.filter((i) => i.type === type) ?? []).map((i) => ({
    itemId: i.id,
    name: i.name,
    img: i.img
  }));
  if (!items.length) return null;
  return { kind: "actionList", title: L(titleKey), items };
}

function weaponListBlock(actor) {
  let weapons = actor.items?.filter((i) => i.type === "weapon") ?? [];
  // Prefer equipped weapons if the system exposes the flag; otherwise show all.
  if (weapons.some((w) => "equipped" in (w.system ?? {}))) {
    weapons = weapons.filter((w) => w.system?.equipped);
  }
  const items = weapons.map((w) => ({ itemId: w.id, name: w.name, img: w.img }));
  if (!items.length) return null;
  return { kind: "actionList", title: L("list.weapons"), items };
}

function experiencesBlock(actor) {
  const exp = actor.system?.experiences;
  const list = exp ? Object.values(exp) : [];
  if (!list.length) return null;
  const esc = Handlebars.escapeExpression;
  const rows = list
    .map((e) => {
      const v = e?.value;
      const sign = typeof v === "number" && v >= 0 ? "+" : "";
      const mod = v != null ? `${sign}${v} ` : "";
      return `<li>${esc(`${mod}${e?.name ?? ""}`.trim())}</li>`;
    })
    .join("");
  return { kind: "info", title: L("list.experiences"), html: `<ul>${rows}</ul>` };
}

function buildIdentity(actor) {
  const cls = actor.items?.find((i) => i.type === "class")?.name;
  const sub = actor.items?.find((i) => i.type === "subclass")?.name;
  const level = actor.system?.level?.value ?? actor.system?.level;

  const parts = [];
  if (typeof level === "number" || (typeof level === "string" && level)) {
    parts.push(`${L("label.level")} ${level}`);
  }
  if (cls) parts.push(sub ? `${cls} (${sub})` : cls);

  const identity = { name: actor.name, img: actor.img };
  if (parts.length) identity.subtitle = parts.join(" · ");
  return identity;
}

function adjustResource(actor, key, delta) {
  const res = actor.system?.resources?.[key];
  if (!res) return;
  const max = resolveMax(key, res);
  const next = clamp((res.value ?? 0) + delta, 0, max); // lower 0; upper max if known
  return actor.update({ [`system.resources.${key}.value`]: next });
}

// --- adapter -----------------------------------------------------------------

/** @type {MobileSheetAdapter} */
export const daggerheartAdapter = {
  systemId: SYSTEM_ID,
  actorTypes: ["character"],

  /** The version seam (spec §3). Cheap, side-effect-free, never throws. */
  checkAvailability() {
    if (game.system?.id !== SYSTEM_ID) return { ok: false, reason: L("unsupported.api") };

    const hasDuality = !!CONFIG?.Dice?.daggerheart?.DualityRoll;
    const hasRollTrait = typeof CONFIG?.Actor?.documentClass?.prototype?.rollTrait === "function";
    if (!hasDuality || !hasRollTrait) return { ok: false, reason: L("unsupported.api") };

    // version >= MIN_VERSION  ⇔  MIN_VERSION is not newer than the installed version.
    const okVersion = !foundry.utils.isNewerVersion(MIN_VERSION, game.system.version ?? "0");
    if (!okVersion) return { ok: false, reason: L("unsupported.version") };

    return { ok: true };
  },

  /** PURE: actor.system → view model. No async, no DOM, no writes. */
  getViewModel(actor) {
    const blocks = [
      resourceBlock(actor, "hitPoints"),
      resourceBlock(actor, "stress"),
      resourceBlock(actor, "hope"),
      statGridBlock(actor),
      weaponListBlock(actor),
      itemListBlock(actor, "domainCard", "list.domainCards"),
      itemListBlock(actor, "feature", "list.features"),
      itemListBlock(actor, "consumable", "list.consumables"),
      experiencesBlock(actor)
    ].filter(Boolean);

    return { identity: buildIdentity(actor), blocks };
  },

  /** Delegate each intent to the system's own method. Unknown intent → no-op. */
  async invoke(actor, intent) {
    switch (intent.type) {
      case "rollStat":
        return actor.rollTrait?.(intent.key, { event: intent.event });
      case "useItem":
        return actor.items.get(intent.itemId)?.use?.(intent.event);
      case "adjustResource":
        return adjustResource(actor, intent.key, intent.delta);
      case "openItem":
        return actor.items.get(intent.itemId)?.sheet?.render(true);
      default:
        return;
    }
  }
};
