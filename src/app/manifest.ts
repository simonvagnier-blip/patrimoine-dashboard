import type { MetadataRoute } from "next";

/**
 * Manifest PWA (C3). `display: standalone` est OBLIGATOIRE sur iOS :
 * sans lui, pas de PushManager dans le service worker.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Command Center — Patrimoine",
    short_name: "Patrimoine",
    description: "Suivi patrimonial personnel",
    id: "/perso/patrimoine",
    start_url: "/perso/patrimoine",
    scope: "/",
    display: "standalone",
    background_color: "#080c14",
    theme_color: "#080c14",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
