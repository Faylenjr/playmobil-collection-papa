import { createHash } from "node:crypto";

const TOPIC = "MARKETPLACE_ACCOUNT_DELETION";

export function createEbayChallengeResponse(
  challengeCode: string,
  verificationToken: string,
  endpoint: string,
) {
  if (!challengeCode) throw new Error("challenge_code absent");
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(verificationToken)) {
    throw new Error("EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN invalide");
  }
  if (!endpoint.startsWith("https://")) {
    throw new Error("EBAY_ACCOUNT_DELETION_ENDPOINT doit utiliser HTTPS");
  }

  return createHash("sha256")
    .update(challengeCode)
    .update(verificationToken)
    .update(endpoint)
    .digest("hex");
}

export function isEbayAccountDeletionNotification(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const metadata = record.metadata;
  const notification = record.notification;
  if (!metadata || typeof metadata !== "object") return false;
  if (!notification || typeof notification !== "object") return false;

  const metadataRecord = metadata as Record<string, unknown>;
  const notificationRecord = notification as Record<string, unknown>;
  return metadataRecord.topic === TOPIC
    && typeof notificationRecord.notificationId === "string"
    && notificationRecord.notificationId.length > 0;
}

