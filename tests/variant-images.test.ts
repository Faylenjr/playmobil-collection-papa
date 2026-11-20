import { describe, expect, it } from "vitest";
import reviewed from "../data/audit/reviewed-official-images.json";
import { getImageDisplayPolicy, getReviewedImageVariantIds, selectVariantImages } from "../lib/variant-images";

const tower = reviewed.find(({ reference }) => reference === "72113")!;
const variant = {
  id: tower.variantId,
  variantKind: tower.variantKind,
  references: [{ normalizedValue: tower.reference, identityClass: "ASSIGNED", isPrimary: true }],
  media: [
    { sourceUrl: "https://www.klickypedia.com/legacy.jpg", kind: "box_front", canDisplay: true, source: { key: "klickypedia", kind: "COMMUNITY_DATABASE" } },
    { sourceUrl: "https://example.org/permission-unknown.jpg", kind: "box_front", canDisplay: null, source: { key: "other", kind: "OTHER" } },
    { sourceUrl: "https://example.org/approved.jpg", kind: "main", canDisplay: true, source: { key: "other", kind: "OTHER" } },
  ],
};
const authorized = getImageDisplayPolicy({ PLAYMOBIL_OFFICIAL_MEDIA_AUTHORIZATION: "authorization-test" });

describe("reviewed image selection", () => {
  it("preserves the manifest's one-to-one variant identities and provenance", () => {
    expect(reviewed.length).toBeGreaterThanOrEqual(35);
    expect(new Set(reviewed.map((row) => row.variantId)).size).toBe(reviewed.length);
    expect(reviewed.filter((row) => row.sourcePageStatus === "indexed_only").map((row) => row.reference)).toEqual(["71720", "72267-GER"]);
    for (const row of reviewed) {
      expect(row.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const base = row.reference.split("-")[0];
      expect([base, `${base}-A`]).toContain(row.officialReference);
      expect(new URL(row.sourcePage).pathname.endsWith(`/${row.officialReference}.html`)).toBe(true);
      expect(new URL(row.image.sourceUrl).pathname).toMatch(new RegExp(`/${row.officialReference}_(?:product_box_front|product_detail)$`));
    }
  });

  it("skips pending official images and the disabled source", () => {
    expect(selectVariantImages(variant, getImageDisplayPolicy({}))).toEqual([{ sourceUrl: "https://example.org/approved.jpg", kind: "main" }]);
    expect(getReviewedImageVariantIds(getImageDisplayPolicy({ PLAYMOBIL_OFFICIAL_MEDIA_PREVIEW: "1", NODE_ENV: "production", PGLITE_DIR: ".data/fixture" }))).toEqual([]);
    expect(getReviewedImageVariantIds(getImageDisplayPolicy({ PLAYMOBIL_OFFICIAL_MEDIA_PREVIEW: "1", NODE_ENV: "development" }))).toEqual([]);
    expect(getReviewedImageVariantIds(getImageDisplayPolicy({ PLAYMOBIL_OFFICIAL_MEDIA_PREVIEW: "1", NODE_ENV: "development", PGLITE_DIR: ".data/fixture" }))).toContain(tower.variantId);
  });

  it("orders an admissible personal image, the exact official image, then approved alternatives", () => {
    const personal = { sourceUrl: "/collection-photos/exact.webp", kind: "main", canDisplay: true, source: { key: "collector-personal", kind: "OTHER" } };
    const input = { ...variant, media: [...variant.media, personal] };
    expect(selectVariantImages(input, authorized).map(({ sourceUrl }) => sourceUrl)).toEqual([personal.sourceUrl, tower.image.sourceUrl, "https://example.org/approved.jpg"]);
    expect(input.media).toContain(variant.media[0]);
  });

  it("rejects a mismatch in variant, edition or commercial reference", () => {
    for (const incorrect of [
      { ...variant, id: "different-variant" },
      { ...variant, variantKind: "MARKET" },
      { ...variant, references: [{ normalizedValue: "72113-GER", identityClass: "ASSIGNED", isPrimary: true }] },
      { ...variant, references: [{ normalizedValue: "72113", identityClass: "REUSED", isPrimary: true }] },
      { ...variant, references: [{ normalizedValue: "72113", identityClass: "ASSIGNED", isPrimary: false }] },
    ]) {
      expect(selectVariantImages(incorrect, authorized, tower)).not.toContainEqual(tower.image);
    }
  });

  it("deduplicates approved URLs and applies the source and host switches", () => {
    const stored = { ...tower.image, canDisplay: true, source: { key: "playmobil-official-fr", kind: "OFFICIAL" } };
    const input = { ...variant, media: [stored, ...variant.media] };
    expect(selectVariantImages(input, authorized).filter((item) => item.sourceUrl === tower.image.sourceUrl)).toHaveLength(1);
    for (const disabled of ["playmobil-official", "media.playmobil.com"]) {
      const policy = getImageDisplayPolicy({ PLAYMOBIL_OFFICIAL_MEDIA_AUTHORIZATION: "authorization-test", PLAYMOBIL_DISABLED_MEDIA_SOURCES: `klickypedia,${disabled}` });
      expect(selectVariantImages(input, policy)).not.toContainEqual(tower.image);
    }
  });
});
