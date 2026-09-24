import "dotenv/config";
import { createEmbeddedDatabaseClient } from "../src/db/embedded.js";

if (!process.env.PGLITE_DIR) {
  throw new Error("PGLITE_DIR is required so the demo seed cannot target production PostgreSQL");
}

const { db, database } = await createEmbeddedDatabaseClient(process.env.PGLITE_DIR);

const samples = [
  { reference: "4490", name: "Grande ferme familiale", kind: "SET" as const, pieces: 312, figures: 5, year: 2008, theme: "Farm", slug: "farm", format: "Large boxed set" },
  { reference: "70132", name: "Grande ferme avec silo", kind: "SET" as const, pieces: 257, figures: 4, year: 2020, theme: "Farm", slug: "farm", format: "Box" },
  { reference: "6867", name: "Tracteur avec remorque", kind: "SET" as const, pieces: 74, figures: 1, year: 2016, theme: "Farm", slug: "farm", format: "Vehicle set" },
  { reference: "00000-FARMER", name: "Fermier", kind: "FIGURE" as const, pieces: 7, figures: 1, year: 2019, theme: "Farm", slug: "farm", format: "Figure" },
  { reference: "00000-COW", name: "Vache tachetée", kind: "FIGURE" as const, pieces: 1, figures: 0, year: 2018, theme: "Farm", slug: "farm", format: "Animal" },
  { reference: "00000-BUCKET", name: "Seau de ferme", kind: "ACCESSORY" as const, pieces: 1, figures: 0, year: 2017, theme: "Farm", slug: "farm", format: "Accessory" },
  { reference: "3666", name: "Grand château des chevaliers", kind: "SET" as const, pieces: 420, figures: 8, year: 1993, theme: "Knights", slug: "knights", format: "Large boxed set" },
  { reference: "3750", name: "Bateau pirate", kind: "SET" as const, pieces: 198, figures: 4, year: 1990, theme: "Pirates", slug: "pirates", format: "Box" },
  { reference: "5245", name: "Fort western", kind: "SET" as const, pieces: 289, figures: 6, year: 2012, theme: "Western", slug: "western", format: "Large boxed set" },
  { reference: "71202", name: "Ambulance avec effets lumineux", kind: "SET" as const, pieces: 84, figures: 3, year: 2023, theme: "City Life", slug: "city-life", format: "Vehicle set" },
];

try {
  const source = await db.source.upsert({
    where: { key: "demo-official" },
    update: {},
    create: { key: "demo-official", name: "Données locales de démonstration", baseUrl: "https://www.playmobil.com", kind: "OFFICIAL", priority: 10, enabled: false },
  });

  for (const sample of samples) {
    const theme = await db.theme.upsert({
      where: { slug: sample.slug },
      update: { name: sample.theme },
      create: { slug: sample.slug, name: sample.theme },
    });
    const product = await db.product.upsert({
      where: { canonicalKey: `demo:${sample.reference}` },
      update: {},
      create: {
        canonicalKey: `demo:${sample.reference}`,
        baseReference: sample.reference,
        kind: sample.kind,
        name: sample.name,
        releaseYear: sample.year,
      },
    });
    await db.productTheme.upsert({
      where: { productId_themeId: { productId: product.id, themeId: theme.id } },
      update: { isPrimary: true },
      create: { productId: product.id, themeId: theme.id, isPrimary: true },
    });
    const variant = await db.productVariant.upsert({
      where: { canonicalKey: `demo:${sample.reference}:standard` },
      update: {},
      create: {
        productId: product.id,
        canonicalKey: `demo:${sample.reference}:standard`,
        variantKind: "STANDARD",
        name: sample.name,
        releaseYear: sample.year,
        format: sample.format,
        pieceCount: sample.pieces,
        figureCount: sample.figures,
      },
    });
    await db.variantTheme.upsert({
      where: { variantId_themeId: { variantId: variant.id, themeId: theme.id } },
      update: { isPrimary: true },
      create: { variantId: variant.id, themeId: theme.id, isPrimary: true },
    });
    await db.productReference.upsert({
      where: { variantId_normalizedValue: { variantId: variant.id, normalizedValue: sample.reference.toUpperCase() } },
      update: {},
      create: {
        variantId: variant.id,
        displayValue: sample.reference,
        normalizedValue: sample.reference.toUpperCase(),
        baseValue: sample.reference.split("-")[0] ?? null,
        isPrimary: true,
        sourceId: source.id,
        identityClass: sample.reference.startsWith("00000") ? "PLACEHOLDER" : "ASSIGNED",
      },
    });
  }
} finally {
  await db.$disconnect();
  await database.close();
}

console.log(`Demo locale prête : ${samples.length} variantes.`);
