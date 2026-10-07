import "dotenv/config";
import { getNodeDatabaseClient } from "../lib/db-node";
import { KelkooPublisherClient, kelkooAdapterConfiguration, matchKelkooOffer } from "../lib/kelkoo-adapter";

async function main() {
  const references = [...new Set((process.argv.find((arg) => arg.startsWith("--references="))?.slice("--references=".length) ?? "").split(",").map((value) => value.trim()).filter(Boolean))];
  if (!references.length) throw new Error("Références explicites requises: --references=71592,70201");
  const configuration = kelkooAdapterConfiguration();
  if (!configuration.enabled || !process.env.KELKOO_PUBLISHER_TOKEN) {
    console.log(JSON.stringify({ mode: "READ_ONLY_SMOKE_TEST", writes: 0, blocked: "KELKOO_PUBLISHER_TOKEN absent", references }, null, 2));
    return;
  }
  const db = getNodeDatabaseClient();
  try {
    const variants = await db.productVariant.findMany({
      where: { references: { some: { isPrimary: true, baseValue: { in: references }, identityClass: "ASSIGNED" } } },
      select: {
        id: true,
        references: { where: { isPrimary: true }, take: 1, select: { baseValue: true } },
        identifiers: { where: { type: { in: ["EAN", "GTIN", "UPC"] } }, select: { normalizedValue: true } },
        product: { select: { identifiers: { where: { type: { in: ["EAN", "GTIN", "UPC"] } }, select: { normalizedValue: true } } } },
      },
    });
    const client = new KelkooPublisherClient(process.env.KELKOO_PUBLISHER_TOKEN, configuration.country);
    const results = [];
    for (const variant of variants) {
      const reference = variant.references[0]?.baseValue;
      if (!reference) continue;
      const eans = [...variant.identifiers, ...variant.product.identifiers].map(({ normalizedValue }) => normalizedValue);
      const rows = await client.search(reference);
      const matches = rows.map((offer) => ({ offerId: offer.offerId, merchant: offer.merchantName, title: offer.title, ...matchKelkooOffer(offer, { reference, eans }) }));
      results.push({ reference, received: rows.length, accepted: matches.filter(({ accepted }) => accepted).length, rejected: matches.filter(({ accepted }) => !accepted).length, samples: matches.slice(0, 10) });
    }
    console.log(JSON.stringify({ mode: "READ_ONLY_SMOKE_TEST", writes: 0, requested: references.length, foundLocally: variants.length, results }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
