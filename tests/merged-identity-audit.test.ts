import { describe, expect, it } from "vitest";
import {
  clusterMergedSourceRecords,
  isSourceReferenceConsistent,
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
  sourceReferenceConsistent: true,
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
    expect(result.classification).toBe("MATCH");
    expect(result.clusters).toEqual([{ id: "cluster-1", recordIds: ["v1", "v2", "v3"], relationship: "MATCH" }]);
    expect(result.relations.every((relation) => relation.relationship === "MATCH")).toBe(true);
  });

  it("keeps duplicate pages with the same name in one cluster", () => {
    const result = clusterMergedSourceRecords([
      record("page-2", "Playmobil 80146"),
      record("page-1", "Playmobil 80146"),
    ]);
    expect(result.classification).toBe("MATCH");
    expect(result.clusters).toHaveLength(1);
  });

  it("splits Share the Smile colors into DISTINCT clusters", () => {
    const colors = ["green", "yellow", "blue", "gold", "red", "white"];
    const result = clusterMergedSourceRecords(colors.map((color) => record(
      color,
      `Playmobil Share the Smile 40º (${color})`,
      { declaredReference: "30825013-GER", urlReferenceCandidate: "30825013-GER", format: "Promotional item", productKind: "PROMOTIONAL_ITEM" },
    )));
    expect(result.classification).toBe("DISTINCT");
    expect(result.clusters).toHaveLength(6);
    expect(result.relations.every((relation) => relation.relationship === "DISTINCT")).toBe(true);
  });

  it.each([
    ["Genie", "Mermaid", "30883802-GER"],
    ["Archer", "Gladiator", "70752V7"],
  ])("classifies %s and %s as DISTINCT figure characters", (left, right, reference) => {
    const result = clusterMergedSourceRecords([
      record("left", left, { declaredReference: reference, urlReferenceCandidate: reference }),
      record("right", right, { declaredReference: reference, urlReferenceCandidate: reference }),
    ]);
    expect(result.classification).toBe("DISTINCT");
    expect(result.relations[0]).toMatchObject({ relationship: "DISTINCT" });
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
    expect(result.classification).toBe("DISTINCT");
    expect(result.relations[0]).toMatchObject({ relationship: "DISTINCT", reason });
  });

  it("keeps a near match ambiguous when no explicit distinction is defensible", () => {
    const result = clusterMergedSourceRecords([
      record("one", "Police car", { format: "Set", productKind: "SET" }),
      record("two", "Police car set", { format: "Set", productKind: "SET" }),
    ]);
    expect(result.classification).toBe("AMBIGUOUS");
  });

  it("quarantines Patrick Pentz V13 declared as V12 as a source inconsistency", () => {
    const patrickUrl = "https://www.klickypedia.com/sets/72306v13-patrick-pentz/";
    const candidate = referenceCandidateFromSource("klickypedia", "sets/72306v13-patrick-pentz", patrickUrl);
    expect(candidate).toBe("72306V13");
    expect(isSourceReferenceConsistent("72306v12", candidate)).toBe(false);

    const result = clusterMergedSourceRecords([
      record("konrad", "Konrad Laimer", { declaredReference: "72306v12", urlReferenceCandidate: "72306V12" }),
      record("patrick", "Patrick Pentz", {
        externalId: "sets/72306v13-patrick-pentz",
        sourceUrl: patrickUrl,
        declaredReference: "72306v12",
        urlReferenceCandidate: candidate,
        sourceReferenceConsistent: false,
      }),
    ]);
    expect(result.classification).toBe("SOURCE_INCONSISTENCY");
    expect(result.relations[0]).toMatchObject({ relationship: "AMBIGUOUS", reason: "source-reference-mismatch" });
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
    expect(forward.classification).toBe("DISTINCT");
    expect(forward.clusters.map((cluster) => cluster.recordIds)).toEqual([["green-1", "green-2"], ["red"]]);
  });

  it("normalizes dotted references when checking URL evidence", () => {
    const candidate = referenceCandidateFromSource("klickypedia", "sets/23-40-8-example", "https://www.klickypedia.com/sets/23-40-8-example/");
    expect(candidate).toBe("23-40-8");
    expect(isSourceReferenceConsistent("23.40.8", candidate)).toBe(true);
  });

  it("does not mistake Klickypedia duplicate-page suffixes for distinct references", () => {
    const candidate = referenceCandidateFromSource("klickypedia", "sets/80146-2-example", "https://www.klickypedia.com/sets/80146-2-example/");
    expect(candidate).toBe("80146-2");
    expect(isSourceReferenceConsistent("80146", candidate)).toBe(true);
  });
});
