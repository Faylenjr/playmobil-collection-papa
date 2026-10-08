const frenchThemeNames: Record<string, string> = {
  adventure: "Aventure", airport: "Aéroport", "animal-clinic": "Clinique vétérinaire",
  "arctic-expedition": "Expédition arctique", christmas: "Noël", circus: "Cirque",
  "city-life": "Vie en ville", "city-service": "Services de la ville", coastguard: "Garde-côtes",
  construction: "Chantier", country: "Campagne", "dinosaur-expedition": "Expédition dinosaures",
  dollhouse: "Maison de poupée", easter: "Pâques", egyptians: "Égyptiens", fairies: "Fées",
  "family-fun": "Loisirs en famille", farm: "Ferme", "figures-series": "Séries de figurines",
  "first-smile": "Premier sourire", freetime: "Temps libre", "future-planet": "Planète du futur",
  gods: "Dieux", "greeting-card": "Cartes de vœux", harbour: "Port", hospital: "Hôpital",
  "how-to-train-your-dragon": "Dragons", knights: "Chevaliers", leisure: "Loisirs", magic: "Magie",
  merchandise: "Produits dérivés", "micro-world": "Monde miniature", "mini-sets": "Mini-sets",
  "modern-house": "Maison moderne", "old-houses": "Maisons anciennes", outdoor: "Plein air",
  "playmobil-the-movie": "Playmobil : Le Film", prehistoric: "Préhistoire", princess: "Princesses",
  racing: "Course automobile", rescue: "Secours", "riding-stables": "Centre équestre",
  romans: "Romains", space: "Espace", "summer-fun": "Loisirs d’été", television: "Télévision",
  "the-explorers": "Les Explorateurs", "top-agents": "Agents secrets", traffic: "Circulation",
  train: "Trains", victorian: "Époque victorienne", waterworld: "Monde aquatique",
  wedding: "Mariage", "winter-fun": "Loisirs d’hiver",
};

export function getFrenchThemeName(theme: { slug: string; name: string }) {
  return frenchThemeNames[theme.slug] ?? theme.name;
}
