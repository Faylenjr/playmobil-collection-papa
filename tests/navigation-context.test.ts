import { describe, expect, it } from "vitest";
import { buildInternalUrl, productHref, sanitizeReturnTo } from "../lib/navigation-context";

describe("navigation context", () => {
  it("preserves catalogue filters and future query parameters", () => {
    const returnTo = buildInternalUrl("/catalogue", { theme: "pirates", page: "8", sort: "reference", future: "yes" });
    expect(returnTo).toBe("/catalogue?theme=pirates&page=8&sort=reference&future=yes");
    expect(productHref("variant-id", returnTo)).toContain(encodeURIComponent(returnTo));
  });

  it("only accepts allow-listed internal paths", () => {
    expect(sanitizeReturnTo("/collection?q=pirate&page=5")).toBe("/collection?q=pirate&page=5");
    expect(sanitizeReturnTo("https://example.com/phishing")).toBe("/catalogue");
    expect(sanitizeReturnTo("//example.com/phishing")).toBe("/catalogue");
    expect(sanitizeReturnTo("/catalogue\\evil")).toBe("/catalogue");
    expect(sanitizeReturnTo("/admin")).toBe("/catalogue");
  });
});
