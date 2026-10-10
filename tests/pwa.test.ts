import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getPwaManifest } from "../lib/pwa-manifest";

describe("PWA configuration", () => {
  it("uses the protected production origin as one scoped standalone app", () => {
    const value = getPwaManifest();
    expect(value.name).toBe("Playmobil Collection");
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.lang).toBe("fr");
    expect(value.shortcuts?.map(({ url }) => url)).toEqual(expect.arrayContaining(["/collection/ajouter", "/collection", "/recherches", "/nouveautes"]));
    expect(value.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: "192x192" }), expect.objectContaining({ sizes: "512x512", purpose: "maskable" })]));
  });

  it("loads the single protected manifest with Cloudflare Access credentials", async () => {
    const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(layout).not.toContain('manifest: "/manifest.webmanifest"');
    expect(layout.match(/rel="manifest"/g)).toHaveLength(1);
    expect(layout).toContain('href="/manifest.webmanifest" crossOrigin="use-credentials"');
  });

  it("does not cache authenticated dynamic pages or mutations", async () => {
    const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(worker).toContain('const CACHE = "playmobil-shell-v2"');
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
    const pngSize = (icon: Buffer) => ({ width: icon.readUInt32BE(16), height: icon.readUInt32BE(20) });
    expect(pngSize(icon192)).toEqual({ width: 192, height: 192 });
    expect(pngSize(icon512)).toEqual({ width: 512, height: 512 });
    expect(pngSize(maskable)).toEqual({ width: 512, height: 512 });
    expect(pngSize(apple)).toEqual({ width: 180, height: 180 });
  });

  it("keeps the sticky header below the top safe area on every viewport", async () => {
    const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
    const globalHeader = css.slice(css.indexOf(".site-header {"), css.indexOf(".brand {"));
    expect(globalHeader).toContain("min-height: calc(82px + env(safe-area-inset-top, 0px))");
    expect(globalHeader).toContain("padding: env(safe-area-inset-top, 0px) 5vw 0");
    expect(globalHeader).toContain("background: var(--blue-950)");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
  });
});
