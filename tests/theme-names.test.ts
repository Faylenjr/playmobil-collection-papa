import { describe, expect, it } from "vitest";
import { getFrenchThemeName } from "../lib/theme-names";

describe("French theme names", () => {
  it("uses the curated French label for known themes", () => {
    expect(getFrenchThemeName({ slug: "knights", name: "Knights" })).toBe("Chevaliers");
    expect(getFrenchThemeName({ slug: "farm", name: "Farm" })).toBe("Ferme");
    expect(getFrenchThemeName({ slug: "christmas", name: "Christmas" })).toBe("Noël");
  });

  it("keeps the source label when no curated French label exists", () => {
    expect(getFrenchThemeName({ slug: "novelmore", name: "Novelmore" })).toBe("Novelmore");
  });
});
