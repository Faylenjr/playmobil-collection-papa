import { describe, expect, it } from "vitest";
import { getPreferredDisplayName } from "../lib/display-name";

describe("preferred display name", () => {
  it("uses an explicitly official French name first", () => {
    expect(getPreferredDisplayName({ officialFrenchName: "Grand parc pour enfants", variantName: "Park Playground" })).toBe("Grand parc pour enfants");
  });

  it("does not treat an unproven translation as official", () => {
    expect(getPreferredDisplayName({ variantName: "Park Playground", productName: "Playground" })).toBe("Park Playground");
  });

  it("falls back deterministically", () => {
    expect(getPreferredDisplayName({ fallback: "set:123" })).toBe("set:123");
  });
});
