export function buildPriceObservation(input: {
  itemPrice: number;
  shippingPrice?: number | null;
  currency: string;
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "ENDED" | "UNKNOWN";
  observedAt: Date;
}) {
  if (!Number.isFinite(input.itemPrice) || input.itemPrice < 0) throw new Error("Invalid item price");
  if (input.shippingPrice !== null && input.shippingPrice !== undefined && (!Number.isFinite(input.shippingPrice) || input.shippingPrice < 0)) throw new Error("Invalid shipping price");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Invalid currency");
  return {
    itemPrice: input.itemPrice,
    shippingPrice: input.shippingPrice ?? null,
    totalPrice: input.shippingPrice === null || input.shippingPrice === undefined ? null : input.itemPrice + input.shippingPrice,
    currency: input.currency,
    availability: input.availability,
    observedAt: new Date(input.observedAt),
  };
}
