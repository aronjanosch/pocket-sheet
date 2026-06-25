/**
 * Mobile Sheet — dev-only stub adapter.
 *
 * Returns a static v2 view model exercising every block kind / variant so the
 * shell can be built and reviewed without a real system adapter. `invoke` logs.
 *
 * NOT shipped behavior: registered only when the client setting
 * `mobile-sheet.devStub` is enabled. Its systemId is set to the active system
 * at registration time so `resolve` always finds it in dev.
 */

/** @type {import("./contract.js").MobileSheetAdapter} */
export const stubAdapter = {
  systemId: "", // set to game.system.id at registration (see main.js)
  actorTypes: ["character"],

  checkAvailability() {
    return { ok: true };
  },

  getViewModel(actor) {
    const items = (actor?.items?.contents ?? []).slice(0, 3).map((i) => ({
      itemId: i.id,
      name: i.name,
      img: i.img,
      sub: i.type,
      glyph: "✦"
    }));
    return {
      theme: { accent: "#9d8ce0", accentDeep: "#6f5ec7" },
      identity: { name: actor?.name ?? "Stub Hero", img: actor?.img, initials: "SH", subtitle: "Stub adapter" },
      topStats: [{ label: "AC", value: 18 }, { label: "PROF", value: "+3", accent: true }],
      tabs: [
        {
          id: "vitals",
          label: "Vitals",
          blocks: [
            { kind: "tags", items: [{ key: "a", label: "Frightened", active: true }, { key: "b", label: "Poisoned" }, { key: "c", label: "Exhaustion", value: 1 }] },
            { kind: "resource", key: "hp", label: "Hit Points", tone: "hp", value: 34, max: 47, display: "bar", temp: 5 },
            { kind: "resource", key: "hope", label: "Hope", tone: "accent", value: 3, max: 6, display: "diamond" },
            { kind: "resource", key: "armor", label: "Armor", tone: "armor", value: 1, max: 3, display: "pips" },
            { kind: "resource", key: "slots", label: "Spell Slots", display: "tracks", value: 0, max: null, editable: false, tracks: [{ label: "LV 1", value: 4, max: 4 }, { label: "LV 2", value: 2, max: 3 }] },
            { kind: "heading", label: "Abilities" },
            {
              kind: "statGrid",
              stats: [
                { key: "str", label: "Str", value: "+3", sub: 16, save: true, select: true },
                { key: "dex", label: "Dex", value: "+1", sub: 12, rollable: true },
                { label: "Con", value: "+2", sub: 14 }
              ]
            },
            { kind: "heading", label: "Items", count: 3 },
            { kind: "actionList", items }
          ]
        },
        {
          id: "notes",
          label: "Bio",
          blocks: [{ kind: "info", title: "Notes", html: "<p>Stub adapter render check.</p>" }]
        }
      ],
      primary: { label: "⚄ Roll d20", sub: "Initiative +1" }
    };
  },

  async invoke(actor, intent) {
    console.log("mobile-sheet | stub invoke", intent);
  }
};
