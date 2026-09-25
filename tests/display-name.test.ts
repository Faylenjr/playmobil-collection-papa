import { describe, expect, it } from "vitest";
import { getPreferredDisplayName } from "../lib/display-name";

describe("preferred display name", () => {
  it("uses an existing French translation first", () => {
    expect(getPreferredDisplayName({ frenchName: "Grand parc pour enfants", variantName: "Park Playground" })).toBe("Grand parc pour enfants");
  });

  it("keeps the original name when no French translation exists", () => {
    expect(getPreferredDisplayName({ variantName: "Park Playground", productName: "Playground" })).toBe("Park Playground");
  });

  it("falls back deterministically", () => {
    expect(getPreferredDisplayName({ fallback: "set:123" })).toBe("set:123");
  });
});
