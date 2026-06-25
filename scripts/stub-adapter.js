/**
 * Mobile Sheet — dev-only stub adapter (Phase 1 §8).
 *
 * Returns a static view model with one of each block kind so the shell can be
 * built and reviewed before any real adapter exists. `invoke` only logs.
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
      subtitle: i.type
    }));
    return {
      identity: {
        name: actor?.name ?? "Stub Hero",
        img: actor?.img,
        subtitle: "Stub adapter"
      },
      blocks: [
        { kind: "resource", key: "hp", label: "HP", value: 7, max: 10, editable: true },
        { kind: "resource", key: "hope", label: "Hope", value: 3, max: null, editable: true },
        {
          kind: "statGrid",
          stats: [
            { key: "agility", label: "Agility", value: 2, rollable: true },
            { key: "strength", label: "Strength", value: 1, rollable: true },
            { key: "finesse", label: "Finesse", value: 0, rollable: true },
            { label: "Evasion", value: 11, rollable: false }
          ]
        },
        { kind: "actionList", title: "Weapons", items },
        { kind: "info", title: "Notes", html: "<p>Stub adapter render check.</p>" }
      ]
    };
  },

  async invoke(actor, intent) {
    console.log("mobile-sheet | stub invoke", intent);
  }
};
