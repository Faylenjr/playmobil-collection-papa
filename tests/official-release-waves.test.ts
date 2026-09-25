import { describe, expect, it } from "vitest";
import {
  decideOfficialWaveMatch, official2026ManifestDigest, official2026References, official2026ReleaseWaves,
  parseOfficialWavePage, type LocalWaveCandidate,
} from "../lib/official-release-waves";

const candidate = (overrides: Partial<LocalWaveCandidate> = {}): LocalWaveCandidate => ({
  variantId: "variant-a", productId: "product-a", variantKind: "STANDARD", identityClasses: ["ASSIGNED"], ...overrides,
});

describe("official 2026 release-wave corpus", () => {
  it("contains five waves and 43 unique references in deterministic order", () => {
    expect(official2026ReleaseWaves).toHaveLength(5);
    expect(official2026References).toHaveLength(43);
    expect(new Set(official2026References).size).toBe(43);
    expect(official2026ManifestDigest()).toBe("5e8feb7aef6692a93a2178e6a6427c43b47721a755f5f1c2fdde5b3fa22fe4b4");
  });

  it("ignores numeric identifiers outside the editorial region", () => {
    const wave = official2026ReleaseWaves[2];
    const html = `<main><script>const tracking = 79999;</script><div class="experience-region experience-pd_shopPageSimple"><h1>Soccer 2026</h1>${wave.references.map((reference) => `<a href="/${reference}.html">${reference}</a>`).join("")}</div><a href="/78888.html">recommendation</a></main>`;
    expect(parseOfficialWavePage(html, wave).unexpectedReferences).toEqual([]);
  });

  it("detects page drift without inventing missing references", () => {
    const wave = official2026ReleaseWaves[2];
    const html = `<main><h1>New Soccer playsets for 2026</h1><a href="/72056.html">72056</a><a href="/72058.html">72058</a><a href="/79999.html">other</a></main>`;
    expect(parseOfficialWavePage(html, wave)).toEqual({
      title: "New Soccer playsets for 2026",
      observedReferences: ["72056", "72058"],
      missingExpectedReferences: ["72057"],
      unexpectedReferences: ["79999"],
    });
  });

  it.each([
    ["ABSENT", []],
    ["MATCH_UNIQUE", [candidate()]],
    ["MARKET_VARIANT_ONLY", [candidate({ variantKind: "MARKET" })]],
    ["BLOCKED_IDENTITY", [candidate({ identityClasses: ["ASSIGNED", "REUSED"] })]],
    ["MATCH_PRODUCT_UNIQUE", [candidate(), candidate({ variantId: "variant-b" })]],
    ["MATCH_MULTIPLE", [candidate(), candidate({ variantId: "variant-b", productId: "product-b" })]],
  ] as const)("returns %s deterministically", (status, candidates) => {
    const first = decideOfficialWaveMatch(candidates);
    const second = decideOfficialWaveMatch([...candidates].reverse());
    expect(first.status).toBe(status);
    expect(second).toEqual(first);
  });

  it("targets the logical product, including a sole market variant", () => {
    expect(decideOfficialWaveMatch([candidate({ variantKind: "MARKET" })]).automaticTarget).toEqual({ level: "PRODUCT", id: "product-a" });
  });
});
