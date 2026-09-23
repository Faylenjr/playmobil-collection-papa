export interface SourceIdentity {
  key: string;
  name: string;
  baseUrl: string;
  priority: number;
}

export interface RawCollectible {
  source: string;
  externalId: string;
  sourceUrl: string;
  reference: string;
  name?: string;
  locale?: string;
  translations?: Array<{ locale: string; name?: string; description?: string }>;
  releaseYear?: number;
  discontinuedYear?: number;
  theme?: string;
  themes?: string[];
  format?: string;
  exclusive?: string;
  markets?: string[];
  tags?: string[];
  isPromotion?: boolean;
  isExclusive?: boolean;
  description?: string;
  figureCount?: number;
  pieceCount?: number;
  ageMin?: number;
  ageMax?: number;
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  weightGrams?: number;
  status?: string;
  listPrice?: number;
  listPriceCurrency?: string;
  figures?: Array<{ key: string; name?: string; quantity?: number }>;
  parts?: Array<{ partNumber: string; name?: string; quantity?: number; sourceUrl?: string }>;
  partsInventoryComplete?: boolean;
  images?: Array<{ kind: string; url: string; copyrightOwner?: string; author?: string; license?: string; canDisplay?: boolean; canRehost?: boolean }>;
  instructions?: Array<{ url: string; locale?: string }>;
  sourceUpdatedAt?: string;
  contentHash?: string;
  raw: unknown;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}
