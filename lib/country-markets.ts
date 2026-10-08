export const marketCountries: Record<string, { name: string; flag: string }> = {
  GERMANY: { name: "Allemagne", flag: "de" }, FRANCE: { name: "France", flag: "fr" },
  ITALY: { name: "Italie", flag: "it" }, NETHERLANDS: { name: "Pays-Bas", flag: "nl" },
  BELGIUM: { name: "Belgique", flag: "be" }, "USA-PLAYMOBIL": { name: "États-Unis", flag: "us" },
  "USA-SCHAPER": { name: "États-Unis · Schaper", flag: "us" }, "USA-MATTEL": { name: "États-Unis · Mattel", flag: "us" },
  "SPAIN-PLAYMOBIL": { name: "Espagne", flag: "es" }, "SPAIN-FAMOBIL": { name: "Espagne · Famobil", flag: "es" },
  "UK-PLAYMOBIL": { name: "Royaume-Uni", flag: "gb" }, "UK-PLAYPEOPLE": { name: "Royaume-Uni · PlayPeople", flag: "gb" },
  "ARGENTINA-ANTEX": { name: "Argentine · Antex", flag: "ar" }, "GREECE-LYRA": { name: "Grèce · Lyra", flag: "gr" },
  "GREECE-PLAYMOBIL": { name: "Grèce", flag: "gr" }, "BRAZIL-TROL": { name: "Brésil · Trol", flag: "br" },
  "BRAZIL-ESTRELA": { name: "Brésil · Estrela", flag: "br" }, "MEXICO-AURIMAT": { name: "Mexique · Aurimat", flag: "mx" },
  "MEXICO-MATTEL": { name: "Mexique · Mattel", flag: "mx" }, "KOREA-PLAYMOBIL": { name: "Corée du Sud", flag: "kr" },
  "CANADA-IRWIN-TOY": { name: "Canada · Irwin Toy", flag: "ca" }, "AUSTRALIA-KENBRI": { name: "Australie · Kenbrite", flag: "au" },
  "JAPAN-YONEZAWA": { name: "Japon · Yonezawa", flag: "jp" }, "JAPAN-EPOCH": { name: "Japon · Epoch", flag: "jp" },
  "PERU-BASA": { name: "Pérou · Basa", flag: "pe" },
};

export function marketDisplayName(code: string, fallback: string) {
  return marketCountries[code]?.name ?? fallback;
}
