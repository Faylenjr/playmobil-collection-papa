import { describe, expect, it } from "vitest";
import { deriveCandidateStatus } from "../lib/external-candidates";

describe("external candidates", () => {
  it("keeps a single discovery source out of the catalogue", () => expect(deriveCandidateStatus([{ sourceKey: "koupobol", announcedYear: 2027, official: false }]).status).toBe("DISCOVERED"));
  it("marks multi-source agreement as corroborated", () => expect(deriveCandidateStatus([{ sourceKey: "koupobol", announcedYear: 2027, official: false }, { sourceKey: "community", announcedYear: 2027, official: false }]).status).toBe("CORROBORATED"));
  it("lets official confirmation outrank community evidence", () => expect(deriveCandidateStatus([{ sourceKey: "koupobol", announcedYear: 2027, official: false }, { sourceKey: "playmobil", announcedYear: null, official: true }]).status).toBe("OFFICIAL_CONFIRMED"));
  it("surfaces conflicting years", () => expect(deriveCandidateStatus([{ sourceKey: "a", announcedYear: 2027, official: false }, { sourceKey: "b", announcedYear: 2026, official: false }])).toMatchObject({ status: "CONFLICTING" }));
});
