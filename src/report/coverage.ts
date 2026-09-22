import type { PrismaClient } from "../../generated/prisma/client.js";

export interface CoverageMetric { field: string; present: number; total: number; percent: number }

const metric = (field: string, present: number, total: number): CoverageMetric => ({
  field,
  present,
  total,
  percent: total === 0 ? 0 : Math.round((present / total) * 10_000) / 100,
});

export async function buildCoverageReport(db: PrismaClient) {
  const [products, variants, names, years, discontinued, themes, images, boxFront, boxBack, instructions, figureCounts, pieceCounts, conflicts] = await Promise.all([
    db.product.count(),
    db.productVariant.count(),
    db.product.count({ where: { name: { not: null } } }),
    db.product.count({ where: { releaseYear: { not: null } } }),
    db.product.count({ where: { discontinuedYear: { not: null } } }),
    db.product.count({ where: { themes: { some: {} } } }),
    db.productVariant.count({ where: { media: { some: {} } } }),
    db.productVariant.count({ where: { media: { some: { kind: "box_front" } } } }),
    db.productVariant.count({ where: { media: { some: { kind: "box_back" } } } }),
    db.productVariant.count({ where: { instructions: { some: {} } } }),
    db.productVariant.count({ where: { figureCount: { not: null } } }),
    db.productVariant.count({ where: { pieceCount: { not: null } } }),
    db.conflict.count({ where: { status: "OPEN" } }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    totals: { products, variants, conflicts },
    coverage: [
      metric("reference", variants, variants), metric("name", names, products), metric("release_year", years, products),
      metric("discontinued_year", discontinued, products), metric("theme", themes, products), metric("main_image", images, variants),
      metric("box_front", boxFront, variants), metric("box_back", boxBack, variants), metric("instructions", instructions, variants),
      metric("figures_count", figureCounts, variants), metric("parts_count", pieceCounts, variants),
    ],
  };
}
