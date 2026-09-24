import type { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "./db";

export const PAGE_SIZE = 36;
export const KLICKYPEDIA_PLACEHOLDER =
  "https://www.klickypedia.com/wp-content/uploads/2014/08/logo-klickypedia-click.jpg";

const visibleMediaWhere = {
  sourceUrl: { not: KLICKYPEDIA_PLACEHOLDER },
  OR: [{ canDisplay: true }, { canDisplay: null }],
} satisfies Prisma.MediaAssetWhereInput;

export function catalogueWhere(query: string): Prisma.ProductVariantWhereInput {
  const search = query.trim();
  if (!search) return {};

  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { canonicalKey: { contains: search, mode: "insensitive" } },
      { product: { name: { contains: search, mode: "insensitive" } } },
      { product: { canonicalKey: { contains: search, mode: "insensitive" } } },
      { references: { some: { displayValue: { contains: search, mode: "insensitive" } } } },
      { translations: { some: { name: { contains: search, mode: "insensitive" } } } },
    ],
  };
}

export async function getCatalogue(query: string, page: number) {
  const db = getDatabaseClient();
  const where = catalogueWhere(query);
  const [total, variants] = await db.$transaction([
    db.productVariant.count({ where }),
    db.productVariant.findMany({
      where,
      orderBy: [{ releaseYear: { sort: "desc", nulls: "last" } }, { canonicalKey: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        canonicalKey: true,
        name: true,
        releaseYear: true,
        variantKind: true,
        variantLabel: true,
        product: { select: { name: true, baseReference: true, releaseYear: true } },
        references: {
          orderBy: [{ isPrimary: "desc" }, { displayValue: "asc" }],
          take: 2,
          select: { displayValue: true, isPrimary: true },
        },
        themes: {
          orderBy: { isPrimary: "desc" },
          take: 1,
          select: { theme: { select: { name: true } } },
        },
        markets: { take: 2, select: { market: { select: { code: true, name: true } } } },
        media: {
          where: visibleMediaWhere,
          orderBy: [{ kind: "asc" }, { sourceUrl: "asc" }],
          take: 1,
          select: { sourceUrl: true, kind: true },
        },
      },
    }),
  ]);

  return { total, variants, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export function getVariant(id: string) {
  const db = getDatabaseClient();
  return db.productVariant.findUnique({
    where: { id },
    include: {
      product: { include: { translations: true, themes: { include: { theme: true } } } },
      references: { orderBy: [{ isPrimary: "desc" }, { displayValue: "asc" }] },
      translations: { orderBy: { locale: "asc" } },
      themes: { include: { theme: true }, orderBy: { isPrimary: "desc" } },
      markets: { include: { market: true } },
      media: {
        where: visibleMediaWhere,
        include: { source: true },
        orderBy: [{ kind: "asc" }, { sourceUrl: "asc" }],
      },
      instructions: { include: { source: true }, orderBy: { locale: "asc" } },
      figures: { include: { figure: true }, take: 100 },
      parts: { include: { part: true }, take: 100 },
      sourceRecords: {
        include: { source: true },
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });
}
