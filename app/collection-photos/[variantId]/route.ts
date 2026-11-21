import { getDatabaseClient } from "../../../lib/db";
import { PHOTO_REVISION, PHOTO_VARIANT_ID } from "../../../lib/personal-photo";
import { getPhotoAccessConfig, hasPhotoAccess } from "../../../lib/personal-photo-policy";
import { removePersonalPhoto, savePersonalPhoto } from "../../../lib/personal-photo-store";
import { normalizePersonalPhoto, PhotoUploadError, readPhotoUpload } from "../../../lib/personal-photo-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ variantId: string }> };
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: privateHeaders });
}

async function checkAccess(request: Request) {
  const config = getPhotoAccessConfig();
  if (!config) return error(404, "Les photos personnelles sont indisponibles.");
  if (request.method !== "GET" && request.method !== "HEAD" && request.headers.get("origin") !== config.origin) {
    return error(403, "Ouvre la collection depuis son adresse sécurisée.");
  }
  if (!await hasPhotoAccess(request.headers, config)) return error(403, "Connecte-toi pour accéder à tes photos.");
  return null;
}

function previousRevision(request: Request) {
  const match = request.headers.get("if-match");
  const revision = match?.slice(1, -1);
  if (revision && PHOTO_REVISION.test(revision) && match === `"${revision}"`) return revision;
}

function conflict() {
  return error(412, "La photo a changé depuis l’ouverture de la fiche. Réessaie avec la version affichée.");
}

export async function GET(request: Request, { params }: Context) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  const { variantId } = await params;
  if (!PHOTO_VARIANT_ID.test(variantId)) return error(404, "Photo introuvable.");
  try {
    const db = await getDatabaseClient();
    const photo = await db.personalPhoto.findUnique({ where: { variantId }, select: { data: true, revision: true } });
    if (!photo) return error(404, "Photo introuvable.");
    return new Response(photo.data, {
      headers: { ...privateHeaders, "Content-Type": "image/webp", ETag: `"${photo.revision}"` },
    });
  } catch {
    return error(503, "La photo est temporairement indisponible.");
  }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  const { variantId } = await params;
  if (!PHOTO_VARIANT_ID.test(variantId)) return error(404, "Variante introuvable.");
  const previous = previousRevision(request);
  if (!previous && request.headers.get("if-none-match") !== "*") return error(428, "Actualise la fiche avant de modifier la photo.");
  try {
    const db = await getDatabaseClient();
    const variant = await db.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
    if (!variant) return error(404, "Variante introuvable.");
    const { data, type } = await readPhotoUpload(request);
    const photo = await normalizePersonalPhoto(data, type);
    const saved = await savePersonalPhoto(db, variantId, photo.data, photo.revision, previous ?? null);
    if (!saved) return conflict();
    return Response.json({ revision: photo.revision }, { headers: privateHeaders });
  } catch (cause) {
    if (cause instanceof PhotoUploadError) return error(cause.status, cause.message);
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "P2002") return conflict();
    return error(503, "Impossible d’enregistrer la photo. Réessaie dans un instant.");
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const denied = await checkAccess(request);
  if (denied) return denied;
  const { variantId } = await params;
  if (!PHOTO_VARIANT_ID.test(variantId)) return error(404, "Variante introuvable.");
  const revision = previousRevision(request);
  if (!revision) return error(428, "Actualise la fiche avant de retirer la photo.");
  try {
    const removed = await removePersonalPhoto(await getDatabaseClient(), variantId, revision);
    return removed ? new Response(null, { status: 204, headers: privateHeaders }) : conflict();
  } catch {
    return error(503, "Impossible de retirer la photo. Réessaie dans un instant.");
  }
}
