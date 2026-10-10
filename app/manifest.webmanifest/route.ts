import { getPwaManifest } from "../../lib/pwa-manifest";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(getPwaManifest()), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, must-revalidate, max-age=0",
    },
  });
}
