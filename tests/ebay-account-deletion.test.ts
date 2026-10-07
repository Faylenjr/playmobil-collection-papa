import { describe, expect, it } from "vitest";
import {
  createEbayChallengeResponse,
  isEbayAccountDeletionNotification,
} from "../lib/ebay-account-deletion";

describe("eBay marketplace account deletion", () => {
  it("calcule le challenge dans l'ordre exige par eBay", () => {
    const response = createEbayChallengeResponse(
      "challenge-123",
      "token_de_verification_ebay_1234567890",
      "https://playmobil.homeclap.ovh/api/ebay/account-deletion",
    );

    expect(response).toBe("ec7e920a1ddceaddee1f3089ae5cc72315df3a4a73c6fba988afbd5b956c52ac");
  });

  it("refuse un token ou endpoint impropre", () => {
    expect(() => createEbayChallengeResponse("x", "court", "https://example.test"))
      .toThrow(/TOKEN invalide/);
    expect(() => createEbayChallengeResponse(
      "x",
      "token_de_verification_ebay_1234567890",
      "http://example.test",
    )).toThrow(/HTTPS/);
  });

  it("accepte uniquement le topic et un identifiant de notification valides", () => {
    expect(isEbayAccountDeletionNotification({
      metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
      notification: { notificationId: "notification-1", data: { userId: "private" } },
    })).toBe(true);
    expect(isEbayAccountDeletionNotification({
      metadata: { topic: "OTHER" },
      notification: { notificationId: "notification-1" },
    })).toBe(false);
    expect(isEbayAccountDeletionNotification({})).toBe(false);
  });
});
