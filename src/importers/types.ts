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
  releaseYear?: number;
  discontinuedYear?: number;
  theme?: string;
  description?: string;
  images?: Array<{ kind: string; url: string; copyrightOwner?: string }>;
  instructions?: Array<{ url: string; locale?: string }>;
  sourceUpdatedAt?: string;
  raw: unknown;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}
