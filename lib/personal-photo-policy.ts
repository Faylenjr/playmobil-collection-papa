import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

type PhotoAccessConfig = { origin: string; issuer: string; audience: string };
const keySets = new Map<string, JWTVerifyGetKey>();

export function getPhotoAccessConfig(env: NodeJS.ProcessEnv = process.env): PhotoAccessConfig | null {
  const origin = env.PLAYMOBIL_PHOTO_ORIGIN;
  const issuer = env.PLAYMOBIL_ACCESS_ISSUER;
  const audience = env.PLAYMOBIL_ACCESS_AUDIENCE;
  if (!origin || !issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)
      || !audience || !/^[0-9a-f]{64}$/.test(audience)) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) return null;
  } catch {
    return null;
  }
  return { origin, issuer, audience };
}

export async function hasPhotoAccess(headers: Headers, config: PhotoAccessConfig, keys?: JWTVerifyGetKey) {
  const token = headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 8192) return false;
  if (!keys) {
    keys = keySets.get(config.issuer) ?? createRemoteJWKSet(new URL("/cdn-cgi/access/certs", config.issuer), { timeoutDuration: 4000 });
    keySets.set(config.issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub"],
    });
    return payload.type === "app" && typeof payload.email === "string" && payload.email.length > 0;
  } catch {
    return false;
  }
}
