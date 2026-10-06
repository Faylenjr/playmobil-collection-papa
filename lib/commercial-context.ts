export const commercialContextLabels = {
  RETAILER_DISTRIBUTOR: "Éditions partenaires / distributeurs",
  MAGAZINE_PUBLICATION: "Magazines et publications",
  EVENT_VENUE: "Événements et lieux",
  ORGANIZATION_ASSOCIATION: "Organisations et associations",
  PROMOTIONAL_CAMPAIGN: "Opérations promotionnelles",
  BRAND_LICENSE_PARTNER: "Marques, licences et collaborations",
  OTHER_DOCUMENTED_CONTEXT: "Autres contextes documentés",
} as const;

export type CommercialContextKind = keyof typeof commercialContextLabels;

const retailerNames = new Set([
  "alcamPo", "asda", "carrefour", "carrefour; super u", "edeka", "frankfurt duty free",
  "hamleys", "hertie", "idee & spiel", "intermarché", "jc penney", "karstadt", "kaufhof",
  "kaufhof real/metro", "kaufland", "migros", "montgomery ward", "müller", "netto", "nkd",
  "otto versand", "quelle", "real/metro", "rossmann", "sears", "smyths toys", "spiel & spaß",
  "spielzeug ring", "target", "target toys r us", "thalia", "toom baumarkt", "toys r us",
  "vedes", "woolworth", "zara",
].map((value) => value.toLocaleLowerCase("fr")));

const organizationNames = new Set([
  "adac", "bvg", "cruz roja", "dfb stars", "dlrg", "e-esa", "eidgenössischer schwingerverband",
  "elpida", "faO", "german-maltese circle", "johanniter-unfall-hilfe e.v.", "nhl", "öfb",
  "police nationale", "pulizija malta", "puttinu cares", "sbb", "share the smile", "sparkasse",
  "stiftung kinderförderung von playmobil", "tcs (the touring club of switzerland)", "thw", "wwf",
].map((value) => value.toLocaleLowerCase("fr")));

const genericValues = /^(aucun|blister-pack|color|edicions limitada|export exclusif|exklusiv sets|francia|give-away|kindergarten set|méxico|netherland|oui|playmobil|special plus|symbol-box|yes)$/i;
const publicationPattern = /(magazin|magazine|revista|comic|books?\b|hörspiel|audio|aventura de la historia|aventures de l'histoire|collection argentina|collector'?s book|éditions|verlag|hachette|france loisirs|casterman|hoëbeke|schneiderbuch|yps\b)/i;
const eventVenuePattern = /(toy fair|funpark|factory tour|festival|exposition|museum|musée|tourism|tourismus|city of culture|playmobil mansion|rijks museum|van gogh museum|drupa|zirndorf)/i;

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function tagsFrom(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  const tags = (rawPayload as Record<string, unknown>).tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string").map(normalized) : [];
}

export function normalizeCommercialContextName(value: string) {
  return normalized(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function classifyCommercialContext(rawValue: string, rawPayload?: unknown): {
  kind: CommercialContextKind;
  canonicalName: string;
  normalizedName: string;
  reason: string;
} {
  const canonicalName = rawValue.trim().replace(/\s+/g, " ");
  const key = normalized(canonicalName);
  const tags = tagsFrom(rawPayload);
  let kind: CommercialContextKind;
  let reason: string;

  if (!canonicalName || genericValues.test(canonicalName)) {
    kind = "OTHER_DOCUMENTED_CONTEXT";
    reason = "Libellé source conservé sans interprétation commerciale plus forte.";
  } else if (publicationPattern.test(canonicalName)) {
    kind = "MAGAZINE_PUBLICATION";
    reason = "Le libellé source désigne explicitement une publication, un magazine, un livre ou un contenu éditorial.";
  } else if (eventVenuePattern.test(canonicalName)) {
    kind = "EVENT_VENUE";
    reason = "Le libellé source désigne explicitement un événement, un parc, un musée ou un lieu.";
  } else if (retailerNames.has(key)) {
    kind = "RETAILER_DISTRIBUTOR";
    reason = "Le libellé source correspond à une enseigne ou un distributeur identifié dans le corpus audité.";
  } else if (organizationNames.has(key) || /(ministerium|stadt |universität|feuerwehr|verband|foundation|stiftung|touring club|symfon|symphon|wasserwirtschaft)/i.test(canonicalName)) {
    kind = "ORGANIZATION_ASSOCIATION";
    reason = "Le libellé source désigne une organisation, une association, une institution ou une fédération.";
  } else if (tags.includes("promotional") || /\b(promocional|promotional)\b/i.test(canonicalName)) {
    kind = "PROMOTIONAL_CAMPAIGN";
    reason = "Le contexte promotionnel est attesté par le tag structuré ou le libellé de la source.";
  } else if (/^(exclusive (greece lyra|brazil trol)|playmobil trol \/ brazil)$/i.test(canonicalName)) {
    kind = "OTHER_DOCUMENTED_CONTEXT";
    reason = "Le libellé communautaire évoque une exclusivité, mais aucune preuve officielle géographique n'est conservée ; il reste non interprété.";
  } else {
    kind = "BRAND_LICENSE_PARTNER";
    reason = "Le libellé source nomme une marque, une licence ou un partenaire, sans attester une exclusivité géographique.";
  }

  return { kind, canonicalName, normalizedName: normalizeCommercialContextName(canonicalName), reason };
}
