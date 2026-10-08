import { describe, expect, it } from "vitest";
import { summarizeProductStates } from "../lib/collector-insights";

describe("collector product progress", () => {
  const products = [
    { variants: [{ id: "a-fr" }, { id: "a-de" }] },
    { variants: [{ id: "b" }] },
    { variants: [{ id: "c" }] },
  ];

  it("counts a multi-market product only once", () => {
    const states = new Map([
      ["a-fr", { inCollection: true, inWishlist: false, quantity: 1 }],
      ["a-de", { inCollection: false, inWishlist: false, quantity: 0 }],
      ["b", { inCollection: false, inWishlist: true, quantity: 0 }],
      ["c", { inCollection: false, inWishlist: false, quantity: 0 }],
    ]);
    expect(summarizeProductStates(products, states)).toEqual({ total: 3, owned: 1, wanted: 1, missing: 1 });
  });

  it("gives collection precedence over wishlist", () => {
    const states = new Map([
      ["a-fr", { inCollection: true, inWishlist: true, quantity: 3 }],
      ["a-de", { inCollection: false, inWishlist: false, quantity: 0 }],
    ]);
    expect(summarizeProductStates([products[0]!], states)).toEqual({ total: 1, owned: 1, wanted: 0, missing: 0 });
  });
});
