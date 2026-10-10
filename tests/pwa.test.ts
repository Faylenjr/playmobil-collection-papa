import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

describe("PWA configuration", () => {
  it("uses the protected production origin as one scoped standalone app", () => {
    const value = manifest();
    expect(value.name).toBe("Playmobil Collection");
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.lang).toBe("fr");
    expect(value.shortcuts?.map(({ url }) => url)).toEqual(expect.arrayContaining(["/collection/ajouter", "/collection", "/recherches", "/nouveautes"]));
    expect(value.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: "192x192" }), expect.objectContaining({ sizes: "512x512", purpose: "maskable" })]));
  });

  it("does not cache authenticated dynamic pages or mutations", async () => {
    const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain('url.pathname.startsWith("/cdn-cgi/")');
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('fetch(request).catch(() => caches.match("/offline.html"))');
    expect(worker).not.toContain('cache.put(request, response.clone())\n    return response;\n  }\n\n  if (request.mode === "navigate")');
  });

  it("ships the required install icons and an offline explanation", async () => {
    const offline = await readFile(new URL("../public/offline.html", import.meta.url), "utf8");
    const [icon192, icon512, maskable, apple] = await Promise.all([
      readFile(new URL("../public/icons/app-icon-192.png", import.meta.url)),
      readFile(new URL("../public/icons/app-icon-512.png", import.meta.url)),
      readFile(new URL("../public/icons/app-icon-maskable-512.png", import.meta.url)),
      readFile(new URL("../public/icons/apple-touch-icon.png", import.meta.url)),
    ]);
    expect(offline).toContain("Vous êtes hors connexion");
    for (const icon of [icon192, icon512, maskable, apple]) expect(icon.subarray(1, 4).toString()).toBe("PNG");
  });
});
