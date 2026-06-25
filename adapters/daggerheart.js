/**
 * Mobile Sheet — Daggerheart (Foundryborne) adapter (v2: themed, tabbed).
 *
 * The only place Daggerheart knowledge lives. Two halves:
 *   - read: getViewModel(actor) is PURE — maps actor.system → themed tabs + blocks.
 *   - act:  invoke(actor, intent) DELEGATES to the system (rollTrait / item.use /
 *           actor.update / toggleStatusEffect). Never builds a Roll or chat card.
 *
 * Reads defensively (optional chaining + fallbacks) so v13-vs-v14 / pre-2.x data
 * shape drift degrades gracefully — an absent field omits a block, never throws.
 * Fields marked VERIFY are confirmed only against a live Daggerheart 2.x world.
 *
 * @typedef {import("../scripts/contract.js").MobileSheetAdapter} MobileSheetAdapter
 */

const SYSTEM_ID = "daggerheart";
const MIN_VERSION = "2.0.0";

/** The one style this system owns. Everything else is the shell. */
const THEME = { accent: "#d8b35c", accentDeep: "#a87d36" };

/** Daggerheart's six traits, in display order. Keys pass straight to rollTrait. */
const TRAITS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

/** Curated conditions surfaced as toggleable tags (VERIFY ids on a live world). */
const CONDITION_IDS = ["vulnerable", "hidden", "restrained"];

/** Fallback resource maxes when the field stores `max: null` (= system default). */
const RESOURCE_MAX_DEFAULTS = { stress: 6, hope: 6 };

/** Localize an adapter string. The adapter owns Daggerheart vocabulary. */
const L = (suffix) => game.i18n.localize(`MOBILE_SHEET.daggerheart.${suffix}`);

/** Unwrap a value that may be a bare number or a `{ value }` object. */
const num = (x) => (x && typeof x === "object" ? x.value : x);

/** Signed modifier text with a real minus, e.g. +2 / −1. */
const mod = (v) => (typeof v === "number" ? (v >= 0 ? `+${v}` : `−${Math.abs(v)}`) : String(v ?? ""));

// --- helpers ----------------------------------------------------------------

/** Effective max for a resource; ResourcesField stores `max:null` for defaults. */
function resolveMax(key, res) {
  if (typeof res?.max === "number") return res.max;
  return RESOURCE_MAX_DEFAULTS[key] ?? null;
}

function clamp(n, min, max) {
  n = Math.max(min, n);
  if (typeof max === "number") n = Math.min(max, n);
  return n;
}

function resourceBlock(actor, key, label, tone, display) {
  const res = actor.system?.resources?.[key];
  if (!res) return null;
  return {
    kind: "resource",
    key,
    label,
    tone,
    display,
    value: res.value ?? 0,
    max: resolveMax(key, res),
    editable: true
  };
}

function conditionsBlock(actor) {
  const defs = new Map((CONFIG?.statusEffects ?? []).map((s) => [s.id, s]));
  const active = actor.statuses ?? new Set();
  const items = CONDITION_IDS
    .map((id) => {
      const def = defs.get(id);
      if (!def) return null;
      return { key: id, label: game.i18n.localize(def.name ?? def.label ?? id), active: active.has?.(id) };
    })
    .filter(Boolean);
  return items.length ? { kind: "tags", items } : null;
}

function traitsGrid(actor) {
  const sys = actor.system ?? {};
  const stats = TRAITS.map((key) => {
    const v = num(sys.traits?.[key]?.value ?? sys.traits?.[key]) ?? 0;
    return { key, label: L(`trait.${key}`).slice(0, 3), value: mod(v), select: true };
  });
  return { kind: "statGrid", cols: 3, stats };
}

function itemRows(actor, types, map) {
  const list = actor.items?.filter((i) => types.includes(i.type)) ?? [];
  return list.map(map);
}

function domainCardsTab(actor) {
  const rows = itemRows(actor, ["domainCard"], (i) => {
    const domain = i.system?.domain ?? "";
    const level = num(i.system?.level);
    const sub = [domain, level != null ? `${L("label.level")} ${level}` : null].filter(Boolean).join(" · ");
    const recall = num(i.system?.recallCost ?? i.system?.recall);
    const row = { itemId: i.id, name: i.name, sub, glyph: "✦" };
    if (typeof recall === "number" && recall > 0) { row.cost = `↺${recall}`; row.costMuted = true; }
    return row;
  });
  if (!rows.length) return [];
  return [
    { kind: "heading", label: L("heading.domainCards"), count: game.i18n.format("MOBILE_SHEET.daggerheart.loadout.count", { count: rows.length }) },
    { kind: "actionList", items: rows }
  ];
}

function weaponsSection(actor) {
  let weapons = actor.items?.filter((i) => i.type === "weapon") ?? [];
  if (weapons.some((w) => "equipped" in (w.system ?? {}))) {
    weapons = weapons.filter((w) => w.system?.equipped);
  }
  const rows = weapons.map((w) => {
    const trait = w.system?.trait ?? "";
    const range = w.system?.range ?? "";
    const damage = num(w.system?.damage) ?? w.system?.damage?.value ?? "";
    const row = { itemId: w.id, name: w.name, glyph: "⚔", sub: [trait, range].filter(Boolean).join(" · ") };
    if (damage) row.badge = String(damage);
    return row;
  });
  if (!rows.length) return [];
  return [
    { kind: "heading", label: L("heading.equipped") },
    { kind: "actionList", items: rows }
  ];
}

function featuresTab(actor) {
  const blocks = [];
  const exp = experiencesBlock(actor);
  if (exp) blocks.push(exp);

  const rows = itemRows(actor, ["ancestry", "community", "class", "subclass", "feature"], (i) => ({
    itemId: i.id,
    name: i.name,
    sub: typeLabel(i.type)
  }));
  if (rows.length) {
    blocks.push({ kind: "heading", label: L("heading.features") });
    blocks.push({ kind: "actionList", items: rows });
  }
  return blocks;
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
      const m = v != null ? `${sign}${v} ` : "";
      return `<li>${esc(`${m}${e?.name ?? ""}`.trim())}</li>`;
    })
    .join("");
  return { kind: "info", title: L("list.experiences"), html: `<ul>${rows}</ul>` };
}

function itemsTab(actor) {
  const blocks = [];

  const gold = actor.system?.gold;
  if (gold && typeof gold === "object") {
    const tile = (key) => ({ label: L(`gold.${key}`), value: gold[key] ?? 0 });
    const stats = ["handfuls", "bags", "chests"].filter((k) => gold[k] != null).map(tile);
    if (stats.length) {
      blocks.push({ kind: "heading", label: L("heading.gold") });
      blocks.push({ kind: "statGrid", cols: stats.length, stats });
    }
  }

  const rows = itemRows(actor, ["consumable", "loot", "miscellaneous"], (i) => {
    const qty = num(i.system?.quantity);
    return { itemId: i.id, name: i.name, sub: typeof qty === "number" && qty > 1 ? `×${qty}` : "" };
  });
  if (rows.length) {
    blocks.push({ kind: "heading", label: L("heading.inventory") });
    blocks.push({ kind: "actionList", items: rows });
  }
  return blocks;
}

function bioTab(actor) {
  const sys = actor.system ?? {};
  const raw = sys.details?.biography ?? sys.biography ?? sys.background;
  const text = typeof raw === "string" ? raw : raw?.value;
  if (!text || typeof text !== "string" || !text.trim()) return [];
  // getViewModel is sync/pure → cannot enrich (async). Escape owner-supplied text.
  // VERIFY: switch to pre-enriched HTML once a render-time enrich hook exists.
  return [{ kind: "info", title: L("heading.background"), html: `<p>${Handlebars.escapeExpression(text)}</p>` }];
}

function typeLabel(type) {
  const key = `type.${type}`;
  const full = `MOBILE_SHEET.daggerheart.${key}`;
  const localized = game.i18n.localize(full);
  return localized === full ? type.charAt(0).toUpperCase() + type.slice(1) : localized;
}

function buildIdentity(actor) {
  const cls = actor.items?.find((i) => i.type === "class")?.name;
  const sub = actor.items?.find((i) => i.type === "subclass")?.name;
  const level = num(actor.system?.level);

  const parts = [];
  if (typeof level === "number" || (typeof level === "string" && level)) parts.push(`${L("label.level")} ${level}`);
  if (cls) parts.push(sub ? `${cls} · ${sub}` : cls);

  const initials = (actor.name ?? "")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const identity = { name: actor.name, img: actor.img, initials };
  if (parts.length) identity.subtitle = parts.join(" · ");
  return identity;
}

function topStats(actor) {
  const sys = actor.system ?? {};
  const out = [];
  const evasion = num(sys.evasion);
  if (evasion != null) out.push({ label: L("stat.evasion"), value: evasion });
  const prof = num(sys.proficiency);
  if (prof != null) out.push({ label: L("stat.proficiency"), value: mod(prof), accent: true });
  return out;
}

function adjustResource(actor, key, delta) {
  const res = actor.system?.resources?.[key];
  if (!res) return;
  const max = resolveMax(key, res);
  const next = clamp((res.value ?? 0) + delta, 0, max);
  return actor.update({ [`system.resources.${key}.value`]: next });
}

// --- adapter -----------------------------------------------------------------

/** @type {MobileSheetAdapter} */
export const daggerheartAdapter = {
  systemId: SYSTEM_ID,
  actorTypes: ["character"],

  /** The version seam. Cheap, side-effect-free, never throws. */
  checkAvailability() {
    if (game.system?.id !== SYSTEM_ID) return { ok: false, reason: L("unsupported.api") };

    const hasDuality = !!CONFIG?.Dice?.daggerheart?.DualityRoll;
    const hasRollTrait = typeof CONFIG?.Actor?.documentClass?.prototype?.rollTrait === "function";
    if (!hasDuality || !hasRollTrait) return { ok: false, reason: L("unsupported.api") };

    const okVersion = !foundry.utils.isNewerVersion(MIN_VERSION, game.system.version ?? "0");
    if (!okVersion) return { ok: false, reason: L("unsupported.version") };

    return { ok: true };
  },

  /** PURE: actor.system → themed, tabbed view model. No async, no DOM, no writes. */
  getViewModel(actor) {
    const vitals = [
      conditionsBlock(actor),
      resourceBlock(actor, "hitPoints", L("resource.hitPoints"), "hp", "pips"),
      resourceBlock(actor, "stress", L("resource.stress"), "stress", "pips"),
      resourceBlock(actor, "hope", L("resource.hope"), "accent", "diamond"),
      resourceBlock(actor, "armor", L("resource.armor"), "armor", "pips"),
      { kind: "heading", label: L("heading.traits") },
      traitsGrid(actor)
    ].filter(Boolean);

    const loadout = [...domainCardsTab(actor), ...weaponsSection(actor)];

    const tabs = [{ id: "vitals", label: L("tab.vitals"), blocks: vitals }];
    const features = featuresTab(actor);
    if (features.length) tabs.push({ id: "features", label: L("tab.features"), blocks: features });
    if (loadout.length) tabs.push({ id: "loadout", label: L("tab.loadout"), blocks: loadout });
    const items = itemsTab(actor);
    if (items.length) tabs.push({ id: "items", label: L("tab.items"), blocks: items });
    const bio = bioTab(actor);
    if (bio.length) tabs.push({ id: "bio", label: L("tab.bio"), blocks: bio });

    return {
      theme: THEME,
      identity: buildIdentity(actor),
      topStats: topStats(actor),
      tabs,
      primary: { label: L("primary.duality") }
    };
  },

  /** Delegate each intent to the system's own method. Unknown intent → no-op. */
  async invoke(actor, intent) {
    switch (intent.type) {
      case "primary":
      case "rollStat":
        return actor.rollTrait?.(intent.statKey ?? intent.key, { event: intent.event });
      case "useItem":
        return actor.items.get(intent.itemId)?.use?.(intent.event);
      case "openItem":
        return actor.items.get(intent.itemId)?.sheet?.render(true);
      case "adjustResource":
        return adjustResource(actor, intent.key, intent.delta);
      case "toggleTag":
        return actor.toggleStatusEffect?.(intent.key);
      default:
        return;
    }
  }
};
