import {
  createEbayChallengeResponse,
  isEbayAccountDeletionNotification,
} from "../../../../lib/ebay-account-deletion";

export const runtime = "nodejs";

export function GET(request: Request) {
  const challengeCode = new URL(request.url).searchParams.get("challenge_code");
  const verificationToken = process.env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT;

  if (!challengeCode || !verificationToken || !endpoint) {
    return Response.json({ error: "Configuration eBay indisponible" }, { status: 503 });
  }

  try {
    return Response.json({
      challengeResponse: createEbayChallengeResponse(
        challengeCode,
        verificationToken,
        endpoint,
      ),
    });
  } catch {
    return Response.json({ error: "Configuration eBay invalide" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 64_000) {
    return new Response(null, { status: 413 });
  }

  try {
    const payload: unknown = await request.json();
    if (!isEbayAccountDeletionNotification(payload)) {
      return new Response(null, { status: 400 });
    }

    // The catalogue never stores eBay member accounts or personal identifiers.
    // A valid deletion event therefore has no matching user data to remove.
    // Do not log or persist the notification payload: it contains eBay user IDs.
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
