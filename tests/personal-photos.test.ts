import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmbeddedDatabaseClient } from "../src/db/embedded";
import { MAX_PHOTO_UPLOAD, personalPhotoUrl } from "../lib/personal-photo";
import { normalizePersonalPhoto, readPhotoUpload } from "../lib/personal-photo-upload";
import { DELETE, GET, PUT } from "../app/collection-photos/[variantId]/route";

const test = vi.hoisted(() => ({ keys: undefined as ReturnType<typeof createLocalJWKSet> | undefined, db: undefined as unknown }));
vi.mock("jose", async (importOriginal) => ({
  ...await importOriginal<typeof import("jose")>(),
  createRemoteJWKSet: () => test.keys,
}));
vi.mock("../lib/db", () => ({ getDatabaseClient: async () => test.db }));

afterEach(() => vi.unstubAllEnvs());

describe("personal photos", () => {
  it("limits the upload and accepts only a decodable image in the declared format", async () => {
    const oversized = new Request("https://photos.example", {
      method: "PUT", headers: { "content-type": "image/jpeg", "content-length": String(MAX_PHOTO_UPLOAD + 1) }, body: "data",
    });
    await expect(readPhotoUpload(oversized)).rejects.toMatchObject({ status: 413 });
    const streamed = new Request("https://photos.example", {
      method: "PUT", headers: { "content-type": "image/jpeg" }, body: new Uint8Array(MAX_PHOTO_UPLOAD + 1),
    });
    await expect(readPhotoUpload(streamed)).rejects.toMatchObject({ status: 413 });
    await expect(normalizePersonalPhoto(Buffer.from("<svg/>"), "image/jpeg")).rejects.toMatchObject({ status: 415 });
    await expect(normalizePersonalPhoto(Buffer.from([255, 216, 255, 0]), "image/jpeg")).rejects.toMatchObject({ status: 422 });
  });

  it("requires a signed Access session and changes only the exact variant's personal photo", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-personal-photo-"));
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    test.db = db;
    const issuer = "https://collection-test.cloudflareaccess.com";
    const origin = "https://collection-test.example";
    const audience = "a".repeat(64);
    vi.stubEnv("PLAYMOBIL_PHOTO_ORIGIN", origin);
    vi.stubEnv("PLAYMOBIL_ACCESS_ISSUER", issuer);
    vi.stubEnv("PLAYMOBIL_ACCESS_AUDIENCE", audience);
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    test.keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "fixture" }] });
    const token = (aud: string, type = "app") => new SignJWT({ type, email: "collector@example.test" })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer(issuer).setAudience(aud)
      .setIssuedAt().setSubject("collector").setExpirationTime("5m").sign(privateKey);
    try {
      const product = await db.product.create({ data: { canonicalKey: "photo-test-product" } });
      const first = await db.productVariant.create({ data: { productId: product.id, canonicalKey: "photo-first" } });
      const second = await db.productVariant.create({ data: { productId: product.id, canonicalKey: "photo-second" } });
      const official = await db.source.create({ data: {
        key: "photo-test-official", name: "Source officielle", baseUrl: "https://www.playmobil.com", kind: "OFFICIAL",
      } });
      const original = await db.mediaAsset.create({ data: {
        variantId: first.id, sourceId: official.id, kind: "box_front", sourceUrl: "https://media.playmobil.com/original",
      } });
      const ctx = { params: Promise.resolve({ variantId: first.id }) };
      const url = origin + personalPhotoUrl(first.id);
      const signed = { "cf-access-jwt-assertion": await token(audience) };
      expect((await GET(new Request(url), ctx)).status).toBe(403);
      expect((await GET(new Request(url, { headers: { "cf-access-jwt-assertion": await token("b".repeat(64)) } }), ctx)).status).toBe(403);
      expect((await GET(new Request(url, { headers: { "cf-access-jwt-assertion": await token(audience, "meta") } }), ctx)).status).toBe(403);
      const jpeg = await sharp({ create: { width: 40, height: 60, channels: 3, background: "red" } })
        .withMetadata({ orientation: 6 }).jpeg().toBuffer();
      const alt = await sharp({ create: { width: 9, height: 10, channels: 3, background: "blue" } }).png().toBuffer();
      const upload = (bytes: Buffer, type: string, precondition: Record<string, string>, from = origin) => PUT(new Request(url, {
        method: "PUT", headers: { ...signed, ...precondition, origin: from, "content-type": type }, body: Uint8Array.from(bytes),
      }), ctx);
      expect((await upload(jpeg, "image/jpeg", { "If-None-Match": "*" }, "https://other.example")).status).toBe(403);
      expect((await upload(jpeg, "image/jpeg", {})).status).toBe(428);
      const created = await upload(jpeg, "image/jpeg", { "If-None-Match": "*" });
      expect(created.status).toBe(200);
      const { revision } = await created.json();
      const loaded = await GET(new Request(url, { headers: signed }), ctx);
      expect(loaded.headers.get("cache-control")).toContain("no-store");
      expect(loaded.headers.get("content-type")).toBe("image/webp");
      const image = await sharp(Buffer.from(await loaded.arrayBuffer())).metadata();
      expect(image).toMatchObject({ width: 60, height: 40, format: "webp" });
      expect(image.exif).toBeUndefined();
      expect((await upload(alt, "image/png", { "If-None-Match": "*" })).status).toBe(412);
      const replaced = await upload(alt, "image/png", { "If-Match": `"${revision}"` });
      expect(replaced.status).toBe(200);
      const version = (await replaced.json()).revision;
      expect(version).not.toBe(revision);
      const remove = (rev: string) => DELETE(new Request(url, { method: "DELETE", headers: { ...signed, origin, "If-Match": `"${rev}"` } }), ctx);
      expect((await remove(revision)).status).toBe(412);
      expect((await GET(new Request(origin + personalPhotoUrl(second.id), { headers: signed }), {
        params: Promise.resolve({ variantId: second.id }),
      })).status).toBe(404);
      expect((await remove(version)).status).toBe(204);
      expect((await GET(new Request(url, { headers: signed }), ctx)).status).toBe(404);
      expect(await db.mediaAsset.findMany({ where: { variantId: first.id } })).toEqual([original]);
      expect(await db.collectionItem.count()).toBe(0);
      expect(await db.wishlistItem.count()).toBe(0);
    } finally {
      await db.$disconnect();
      await database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
