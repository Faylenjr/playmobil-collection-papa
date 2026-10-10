import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Playmobil Collection",
    short_name: "Playmobil",
    description: "Le carnet personnel pour gérer une collection Playmobil.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f8fc",
    theme_color: "#06234a",
    lang: "fr",
    orientation: "any",
    icons: [
      { src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ajouter un Playmobil", short_name: "Ajouter", url: "/collection/ajouter", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Ma collection", short_name: "Collection", url: "/collection", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Mes recherches", short_name: "Recherches", url: "/recherches", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Nouveautés", short_name: "Nouveautés", url: "/nouveautes", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
    ],
  };
}
