import { describe, expect, it } from "vitest";
import {
  classifyUrlReferenceEvidence,
  clusterMergedSourceRecords,
  referenceCandidateFromSource,
  type MergedRecordEvidence,
} from "../src/domain/merged-record-audit.js";

const record = (id: string, name: string, overrides: Partial<MergedRecordEvidence> = {}): MergedRecordEvidence => ({
  id,
  sourceKey: "klickypedia",
  externalId: `sets/80146-${id}`,
  sourceUrl: `https://www.klickypedia.com/sets/80146-${id}/`,
  contentHash: `hash-${id}`,
  declaredReference: "80146",
  urlReferenceCandidate: "80146",
  urlReferenceEvidence: "EXACT",
  names: { "name.en": name },
  name,
  releaseYear: 2024,
  themes: ["Figures"],
  format: "Figures",
  productKind: "FIGURE",
  ...overrides,
});

describe("merged SourceRecord identity audit", () => {
  it("keeps a true duplicate as one MATCH cluster", () => {
    const result = clusterMergedSourceRecords([
      record("v1", "Example figure"),
      record("v2", "Example figure"),
      record("v3", "Example figure"),
    ]);
    expect(result.identityClassification).toBe("MATCH");
    expect(result.sourceConsistency).toBe("CONSISTENT");
    expect(result.safeAction).toBe("KEEP_MERGED");
    expect(result.clusters).toEqual([{ id: "cluster-1", recordIds: ["v1", "v2", "v3"], relationship: "MATCH" }]);
    expect(result.relations.every((relation) => relation.relationship === "MATCH")).toBe(true);
  });

  it("keeps duplicate pages with the same name in one cluster", () => {
    const result = clusterMergedSourceRecords([
      record("page-2", "Playmobil 80146"),
      record("page-1", "Playmobil 80146"),
    ]);
    expect(result.identityClassification).toBe("MATCH");
    expect(result.clusters).toHaveLength(1);
  });

  it("splits Share the Smile colors into DISTINCT clusters", () => {
    const colors = ["green", "yellow", "blue", "gold", "red", "white"];
    const result = clusterMergedSourceRecords(colors.map((color) => record(
      color,
      `Playmobil Share the Smile 40º (${color})`,
      { declaredReference: "30825013-GER", urlReferenceCandidate: "30825013-GER", format: "Promotional item", productKind: "PROMOTIONAL_ITEM" },
    )));
    expect(result.identityClassification).toBe("DISTINCT");
    expect(result.clusters).toHaveLength(6);
    expect(result.relations.every((relation) => relation.relationship === "DISTINCT")).toBe(true);
  });

  it("classifies production-shaped Genie/Mermaid translations as DISTINCT despite identical secondary signals", () => {
    const result = clusterMergedSourceRecords([
      record("genie", "Genie", {
        declaredReference: "30883802-GER", urlReferenceCandidate: "30883802-GER",
        names: { "name.de": "Flaschengeist", "name.en": "Genie", "name.es": "Genio de la lámpara", "name.fr": "Génie de la lampe" },
        releaseYear: 2005, themes: ["Waterworld"], format: "Blister", productKind: null,
      }),
      record("mermaid", "Mermaid", {
        declaredReference: "30883802-GER", urlReferenceCandidate: "30883802-GER",
        names: { "name.de": "Meerjungfrau", "name.en": "Mermaid", "name.es": "Sirena", "name.fr": "Sirène" },
        releaseYear: 2005, themes: ["Waterworld"], format: "Blister", productKind: null,
      }),
    ]);
    expect(result.identityClassification).toBe("DISTINCT");
    expect(result.relations[0]).toMatchObject({ relationship: "DISTINCT", reason: "strong-multilingual-name-divergence" });
    expect(result.safeAction).toBe("SPLIT");
  });

  it("keeps Archer/Gladiator semantically DISTINCT while flagging both contradictory URL references", () => {
    const result = clusterMergedSourceRecords([
      record("archer", "Archer", {
        externalId: "sets/70752-02-archer", sourceUrl: "https://www.klickypedia.com/sets/70752-02-archer/",
        declaredReference: "70752v7", urlReferenceCandidate: "70752-02", urlReferenceEvidence: "STRONG_MISMATCH",
        names: { "name.de": "Bogenschütze", "name.en": "Archer", "name.es": "Arquero", "name.fr": "Archer" },
        format: "Blister", productKind: null,
      }),
      record("gladiator", "Gladiator", {
        externalId: "sets/70752-07-gladiator", sourceUrl: "https://www.klickypedia.com/sets/70752-07-gladiator/",
        declaredReference: "70752v7", urlReferenceCandidate: "70752-07", urlReferenceEvidence: "STRONG_MISMATCH",
        names: { "name.de": "Gladiator", "name.en": "Gladiator", "name.es": "Gladiador", "name.fr": "Gladiateur" },
        format: "Blister", productKind: null,
      }),
    ]);
    expect(result).toMatchObject({
      identityClassification: "DISTINCT", sourceConsistency: "INCONSISTENT", safeAction: "REVIEW",
    });
    expect(result.relations[0]).toMatchObject({ relationship: "DISTINCT", reason: "strong-multilingual-name-divergence" });
  });

  it.each([
    ["BVG U5", "BVG Tram", "explicit-route-difference"],
    ["Leaflet 1988 - Cover Petrol Station", "Leaflet 1988 - Cover Polar Station", "explicit-cover-content-difference"],
    ["Magazine issue 8", "Magazine issue 9", "explicit-numbered-qualifier-difference"],
  ])("uses explicit semantic descriptors for %s / %s", (left, right, reason) => {
    const result = clusterMergedSourceRecords([
      record("left", left, { format: "Leaflet", productKind: "CATALOGUE" }),
      record("right", right, { format: "Leaflet", productKind: "CATALOGUE" }),
    ]);
    expect(result.identityClassification).toBe("DISTINCT");
    expect(result.relations[0]).toMatchObject({ relationship: "DISTINCT", reason });
  });

  it("keeps a near match ambiguous when no explicit distinction is defensible", () => {
    const result = clusterMergedSourceRecords([
      record("one", "Police car", { format: "Set", productKind: "SET" }),
      record("two", "Police car set", { format: "Set", productKind: "SET" }),
    ]);
    expect(result.identityClassification).toBe("AMBIGUOUS");
  });

  it("keeps Patrick/Konrad identity DISTINCT while separately flagging Patrick's source inconsistency", () => {
    const patrickUrl = "https://www.klickypedia.com/sets/72306v13-patrick-pentz/";
    const candidate = referenceCandidateFromSource("klickypedia", "sets/72306v13-patrick-pentz", patrickUrl);
    expect(candidate).toBe("72306V13");
    expect(classifyUrlReferenceEvidence("72306v12", candidate)).toBe("STRONG_MISMATCH");

    const result = clusterMergedSourceRecords([
      record("konrad", "Konrad Laimer", {
        declaredReference: "72306v12", urlReferenceCandidate: "72306V12",
        names: { "name.de": "Konrad Laimer", "name.en": "Konrad Laimer" },
        format: "Blister", productKind: null,
      }),
      record("patrick", "Patrick Pentz", {
        externalId: "sets/72306v13-patrick-pentz",
        sourceUrl: patrickUrl,
        declaredReference: "72306v12",
        urlReferenceCandidate: candidate,
        urlReferenceEvidence: "STRONG_MISMATCH",
        names: { "name.en": "Patrick Pentz", "name.de": "Patrick Pentz" },
        format: "Blister", productKind: null,
      }),
    ]);
    expect(result).toMatchObject({
      identityClassification: "DISTINCT",
      sourceConsistency: "INCONSISTENT",
      safeAction: "REVIEW",
    });
    expect(result.relations[0]).toMatchObject({ relationship: "DISTINCT", reason: "strong-multilingual-name-divergence" });
  });

  it("produces identical clusters and relations regardless of input order", () => {
    const records = [
      record("green-2", "Share the Smile (green)", { declaredReference: "30825013-GER", urlReferenceCandidate: "30825013-GER" }),
      record("red", "Share the Smile (red)", { declaredReference: "30825013-GER", urlReferenceCandidate: "30825013-GER" }),
      record("green-1", "Share the Smile (green)", { declaredReference: "30825013-GER", urlReferenceCandidate: "30825013-GER" }),
    ];
    const forward = clusterMergedSourceRecords(records);
    const reverse = clusterMergedSourceRecords([...records].reverse());
    expect(reverse).toEqual(forward);
    expect(forward.identityClassification).toBe("DISTINCT");
    expect(forward.clusters.map((cluster) => cluster.recordIds)).toEqual([["green-1", "green-2"], ["red"]]);
  });

  it("normalizes dotted references when checking URL evidence", () => {
    const candidate = referenceCandidateFromSource("klickypedia", "sets/23-40-8-example", "https://www.klickypedia.com/sets/23-40-8-example/");
    expect(candidate).toBe("23-40-8");
    expect(classifyUrlReferenceEvidence("23.40.8", candidate)).toBe("EXACT");
  });

  it.each([
    ["N/A-ITA", "N-A", "WEAK"],
    ["5793-USA", "5793", "COMPATIBLE_BASE"],
    ["23.24.3-TROL", "23-24-3", "COMPATIBLE_BASE"],
    ["3600-FAM", "3600", "COMPATIBLE_BASE"],
    ["80316-GER", "80315-GER", "STRONG_MISMATCH"],
    ["71260", "71620", "STRONG_MISMATCH"],
  ] as const)("grades declared %s versus URL candidate %s as %s", (declared, candidate, expected) => {
    expect(classifyUrlReferenceEvidence(declared, candidate)).toBe(expected);
  });

  it("keeps true 23.40.8 duplicates as MATCH with compatible dotted URL evidence", () => {
    const result = clusterMergedSourceRecords([
      record("v1", "Construction worker", {
        declaredReference: "23.40.8", urlReferenceCandidate: "23-40-8", urlReferenceEvidence: "EXACT",
        names: { "name.en": "Construction worker", "name.fr": "Ouvrier du bâtiment" },
      }),
      record("v2", "Construction worker", {
        declaredReference: "23.40.8", urlReferenceCandidate: "23-40-8", urlReferenceEvidence: "EXACT",
        names: { "name.en": "Construction worker", "name.fr": "Ouvrier du bâtiment" },
      }),
      record("v3", "Construction worker", {
        declaredReference: "23.40.8", urlReferenceCandidate: "23-40-8", urlReferenceEvidence: "EXACT",
        names: { "name.en": "Construction worker", "name.fr": "Ouvrier du bâtiment" },
      }),
    ]);
    expect(result).toMatchObject({ identityClassification: "MATCH", sourceConsistency: "CONSISTENT", safeAction: "KEEP_MERGED" });
  });

  it("does not mistake Klickypedia duplicate-page suffixes for distinct references", () => {
    const candidate = referenceCandidateFromSource("klickypedia", "sets/80146-2-example", "https://www.klickypedia.com/sets/80146-2-example/");
    expect(candidate).toBe("80146-2");
    expect(classifyUrlReferenceEvidence("80146", candidate)).toBe("COMPATIBLE_BASE");
  });
});
