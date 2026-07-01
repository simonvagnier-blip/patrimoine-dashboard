"use client";

import { useEffect } from "react";

/** Enregistre le service worker (offline lecture seule + push). Silencieux. */
export default function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("SW registration failed:", err);
      });
    }
  }, []);
  return null;
}
