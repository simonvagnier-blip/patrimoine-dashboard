"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (offline lecture seule + push). Silencieux.
 * PRODUCTION UNIQUEMENT : en dev, les chunks Turbopack changent à chaque
 * rebuild → un HTML en cache référence des chunks morts et tue l'hydratation
 * (vérifié). En prod les assets sont hashés immuables + navigations
 * network-first : pas ce problème.
 */
export default function PwaSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Nettoie un éventuel SW installé par une session précédente.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  }, []);
  return null;
}
