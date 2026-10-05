import { describe, expect, it } from "vitest";
import { buildOfficialProductImportPlan } from "../lib/official-product-import";

const observation = { market: "fr-FR" as const, sourceUrl: "https://www.playmobil.com/fr-fr/72216.html", reference: "72216", confirmed: true, name: "Calèche des licornes", figureCount: 1, imageKinds: ["box_front"], officialIdentifiers: [{ type: "OFFICIAL_SKU" as const, rawValue: "72216" }], breadcrumbs: [] };

describe("isolated official product import", () => {
  it("creates a conservative plan and leaves unsourced fields null", () => {
    const plan = buildOfficialProductImportPlan({ observedAt: "2026-10-05T00:00:00Z", observations: [observation] }, new Set());
    expect(plan.find((item) => item.reference === "72216")).toMatchObject({ status: "READY", preferredName: "Calèche des licornes", releaseYear: null, pieceCount: null, figureCount: 1 });
  });

  it("blocks a pre-existing local reference", () => {
    const plan = buildOfficialProductImportPlan({ observedAt: "2026-10-05T00:00:00Z", observations: [observation] }, new Set(["72216"]));
    expect(plan.find((item) => item.reference === "72216")?.status).toBe("COLLISION_LOCAL_REFERENCE");
  });
});
