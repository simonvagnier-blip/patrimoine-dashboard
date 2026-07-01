"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "idle" | "subscribing" | "subscribed" | "denied" | "need-install";

/**
 * Cloche d'activation des notifications push (C3).
 * iOS : ne fonctionne que si la PWA est INSTALLÉE sur l'écran d'accueil
 * (Safari → Partager → « Sur l'écran d'accueil ») — sinon on affiche l'astuce.
 * La demande de permission DOIT venir d'un geste utilisateur (règle iOS).
 */
export default function NotificationsButton() {
  const [state, setState] = useState<State>("unsupported");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
      // iOS Safari hors PWA installée : pas de PushManager.
      if (!("PushManager" in window)) {
        const isIos = /iphone|ipad/i.test(navigator.userAgent);
        setState(isIos ? "need-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "idle");
    })().catch(() => {});
  }, []);

  async function subscribe() {
    setState("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const keyRes = await fetch("/api/push/subscribe");
      const { publicKey } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("subscribe API failed");
      setState("subscribed");
      // Confirmation immédiate (prouve la chaîne de bout en bout)
      fetch("/api/push/test", { method: "POST" }).catch(() => {});
    } catch (err) {
      console.error("push subscribe failed:", err);
      setState("idle");
    }
  }

  if (state === "unsupported") return null;

  const label =
    state === "subscribed"
      ? "Notifications activées"
      : state === "denied"
        ? "Notifications bloquées (réglages navigateur)"
        : state === "need-install"
          ? "Pour les notifications : installe l'app (Partager → Sur l'écran d'accueil)"
          : "Activer les notifications";

  return (
    <button
      onClick={state === "idle" ? subscribe : undefined}
      disabled={state !== "idle"}
      aria-label={label}
      title={label}
      className={`p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-md transition-colors ${
        state === "subscribed"
          ? "text-emerald-400"
          : state === "idle"
            ? "text-gray-400 hover:text-white hover:bg-[#161b22]"
            : "text-gray-600"
      }`}
    >
      {state === "subscribing" ? (
        <span className="text-xs">…</span>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          {state === "subscribed" && <circle cx="18" cy="6" r="3" fill="#34d399" stroke="none" />}
        </svg>
      )}
    </button>
  );
}
