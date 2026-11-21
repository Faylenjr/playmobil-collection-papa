import { createHash } from "node:crypto";
import { MAX_PHOTO_UPLOAD, MAX_STORED_PHOTO, PERSONAL_PHOTO_TYPES } from "./personal-photo";

export class PhotoUploadError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function readPhotoUpload(request: Request) {
  const type = PERSONAL_PHOTO_TYPES.find((value) => value === request.headers.get("content-type"));
  if (!type) throw new PhotoUploadError(415, "Choisis une photo JPEG, PNG ou WebP.");
  const tooLarge = new PhotoUploadError(413, "La photo dépasse 12 Mo.");
  if (Number(request.headers.get("content-length")) > MAX_PHOTO_UPLOAD) throw tooLarge;
  const reader = request.body?.getReader();
  if (!reader) throw new PhotoUploadError(400, "Choisis une photo.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PHOTO_UPLOAD) {
        void reader.cancel().catch(() => {});
        throw tooLarge;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { data: Buffer.concat(chunks, total), type };
}

export async function normalizePersonalPhoto(data: Buffer, type: string) {
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  const format = jpeg ? "jpeg" : png ? "png" : webp ? "webp" : null;
  if (!format || type !== `image/${format}`) throw new PhotoUploadError(415, "Le format du fichier ne correspond pas à une photo.");

  const { default: sharp } = await import("sharp");
  let converted: Buffer;
  try {
    const image = sharp(data, { limitInputPixels: 32_000_000, failOn: "error" });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) > 1) throw new Error("Unexpected image format or animation");
    converted = await image
      .autoOrient()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new PhotoUploadError(422, "Impossible de lire cette photo. Choisis une autre image.");
  }
  if (converted.length > MAX_STORED_PHOTO) throw new PhotoUploadError(422, "Choisis une photo moins détaillée ou plus petite.");
  return {
    data: Uint8Array.from(converted),
    revision: createHash("sha256").update(converted).digest("hex"),
  };
}
