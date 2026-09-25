import { describe, expect, it } from "vitest";
import { decidePlaymoDbMatch } from "../lib/playmodb-matching";

const candidate = {
  variantId: "variant-70568",
  identityClass: "ASSIGNED" as const,
  normalizedValue: "70568",
  baseValue: "70568",
  variantsUsingBase: 1,
};

describe("PlaymoDB matching guardrails", () => {
  it("accepts one exact source result for one unique assigned base", () => {
    expect(decidePlaymoDbMatch(candidate, 1)).toEqual({
      status: "MATCH_UNIQUE",
      variantId: "variant-70568",
      setNumber: "70568",
    });
  });

  it("keeps a market variant as the target while using its numeric base for lookup", () => {
    expect(decidePlaymoDbMatch({ ...candidate, variantId: "variant-70568-ger", normalizedValue: "70568-ger" }, 1)).toEqual({
      status: "MATCH_UNIQUE",
      variantId: "variant-70568-ger",
      setNumber: "70568",
    });
  });

  it("sends reused references to review", () => {
    expect(decidePlaymoDbMatch({ ...candidate, variantsUsingBase: 2 }, 1)).toMatchObject({
      status: "REVIEW",
      reason: "REUSED_BASE",
    });
  });

  it.each(["PLACEHOLDER", "REUSED", "AMBIGUOUS"] as const)("skips %s identities", (identityClass) => {
    expect(decidePlaymoDbMatch({ ...candidate, identityClass }, 1)).toMatchObject({
      status: "SKIP",
      reason: "UNSAFE_IDENTITY",
    });
  });

  it("skips a placeholder-looking or non-numeric lookup base", () => {
    expect(decidePlaymoDbMatch({ ...candidate, baseValue: "00000" }, 1)).toMatchObject({ status: "SKIP" });
    expect(decidePlaymoDbMatch({ ...candidate, baseValue: "P017" }, 1)).toMatchObject({ status: "SKIP" });
  });

  it("reports an absent source result without inventing a match", () => {
    expect(decidePlaymoDbMatch(candidate, 0)).toMatchObject({ status: "ABSENT", setNumber: "70568" });
  });

  it("sends multiple source results to review", () => {
    expect(decidePlaymoDbMatch(candidate, 2)).toMatchObject({
      status: "REVIEW",
      reason: "MULTIPLE_SOURCE_MATCHES",
    });
  });
});
