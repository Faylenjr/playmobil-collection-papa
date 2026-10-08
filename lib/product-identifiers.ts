export type ProductIdentifierTypeValue = "EAN" | "GTIN" | "UPC" | "MPN" | "OFFICIAL_SKU";

const digitLengths: Partial<Record<ProductIdentifierTypeValue, readonly number[]>> = {
  EAN: [8, 13],
  GTIN: [8, 12, 13, 14],
  UPC: [12],
};

export function normalizeProductIdentifier(type: ProductIdentifierTypeValue, rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (type in digitLengths) {
    const digits = trimmed.replace(/[\s-]/g, "");
    if (!/^\d+$/.test(digits) || !digitLengths[type]!.includes(digits.length)) return null;
    if (!isValidGtinChecksum(digits)) return null;
    return digits;
  }
  const normalized = trimmed.toUpperCase().replace(/\s+/g, " ");
  return /^[A-Z0-9][A-Z0-9 ._/-]*$/.test(normalized) ? normalized : null;
}

export function isValidGtinChecksum(value: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function identifierObservationKey(input: {
  target: { productId: string } | { variantId: string };
  type: ProductIdentifierTypeValue;
  normalizedValue: string;
  sourceId: string;
  marketId?: string | null;
}) {
  const target = "productId" in input.target ? `product:${input.target.productId}` : `variant:${input.target.variantId}`;
  return [target, input.type, input.normalizedValue, input.sourceId, input.marketId ?? "global"].join("|");
}

export type IdentifierCollisionInput = {
  type: ProductIdentifierTypeValue;
  normalizedValue: string;
  logicalProductId: string;
  confidence?: string;
};

export function findIdentifierCollisions(rows: readonly IdentifierCollisionInput[]) {
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.confidence === "REJECTED") continue;
    const key = `${row.type}:${row.normalizedValue}`;
    const products = groups.get(key) ?? new Set<string>();
    products.add(row.logicalProductId);
    groups.set(key, products);
  }
  return [...groups.entries()]
    .filter(([, products]) => products.size > 1)
    .map(([key, products]) => ({ key, logicalProductIds: [...products].sort() }));
}
