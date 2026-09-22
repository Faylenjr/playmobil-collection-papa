import "dotenv/config";
import { createDatabaseClient } from "../src/db/client.js";

const sources = [
  { key: "playmobil-de", name: "PLAYMOBIL Deutschland", baseUrl: "https://www.playmobil.com/de-de", kind: "OFFICIAL" as const, priority: 10, enabled: true },
  { key: "playmobil-fr", name: "PLAYMOBIL France", baseUrl: "https://www.playmobil.com/fr-fr", kind: "OFFICIAL" as const, priority: 10, enabled: true },
  { key: "playmodb", name: "PlaymoDB", baseUrl: "https://playmodb.org", kind: "COMMUNITY_DATABASE" as const, priority: 20, enabled: false },
  { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" as const, priority: 30, enabled: true },
  { key: "mundobil", name: "Mundobil", baseUrl: "https://www.mundobil.com", kind: "COMMUNITY_DATABASE" as const, priority: 40, enabled: false },
  { key: "playmofanatic", name: "Playmofanatic", baseUrl: "https://www.playmofanatic.org", kind: "COMMUNITY_EDITORIAL" as const, priority: 50, enabled: false },
];

const db = createDatabaseClient();
try {
  for (const source of sources) await db.source.upsert({ where: { key: source.key }, create: source, update: source });
} finally {
  await db.$disconnect();
}
