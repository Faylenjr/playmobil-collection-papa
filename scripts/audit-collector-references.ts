import { createDatabaseClient } from "../src/db/client";
import { classifyCollectorReference } from "../lib/collector-reference";

const db = createDatabaseClient();

try {
  const references = await db.productReference.findMany({
    orderBy: [{ normalizedValue: "asc" }, { variantId: "asc" }],
    include: { variant: { select: { format: true, releaseYear: true, name: true, product: { select: { kind: true } } } } },
  });
  const groups = new Map<string, number>();
  const identities = new Map<string, number>();
  const numericLengths = new Map<number, number>();
  const examples = new Map<string, typeof references>();

  for (const item of references) {
    const group = classifyCollectorReference({
      identityClass: item.identityClass,
      displayValue: item.displayValue,
      normalizedValue: item.normalizedValue,
      baseValue: item.baseValue,
      suffix: item.suffix,
      productKind: item.variant.product.kind,
      format: item.variant.format,
    });
    groups.set(group, (groups.get(group) ?? 0) + 1);
    identities.set(item.identityClass, (identities.get(item.identityClass) ?? 0) + 1);
    if (/^\d+$/.test(item.normalizedValue)) numericLengths.set(item.normalizedValue.length, (numericLengths.get(item.normalizedValue.length) ?? 0) + 1);
    const sample = examples.get(group) ?? [];
    if (sample.length < 20) sample.push(item);
    examples.set(group, sample);
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: references.length,
    groups: Object.fromEntries([...groups].sort()),
    identities: Object.fromEntries([...identities].sort()),
    numericLengths: Object.fromEntries([...numericLengths].sort((a, b) => a[0] - b[0])),
    examples: Object.fromEntries([...examples].map(([group, rows]) => [group, rows.map((row) => ({
      displayValue: row.displayValue,
      normalizedValue: row.normalizedValue,
      baseValue: row.baseValue,
      suffix: row.suffix,
      identityClass: row.identityClass,
      productKind: row.variant.product.kind,
      format: row.variant.format,
      year: row.variant.releaseYear,
      name: row.variant.name,
    }))])),
  }, null, 2));
} finally {
  await db.$disconnect();
}
