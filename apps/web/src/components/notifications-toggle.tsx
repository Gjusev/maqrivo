"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { urlBase64ToUint8Array } from "@/lib/push-utils";

type Stage = "hidden" | "unsupported" | "denied" | "idle" | "enabled" | "subscribed";

/**
 * Daily-deal push opt-in. Renders nothing unless the server has VAPID keys
 * configured; otherwise mirrors the browser permission + subscription state.
 * The service worker itself is registered globally (service-worker.tsx), so
 * we only wait for it (navigator.serviceWorker.ready) before subscribing.
 */
export function NotificationsToggle() {
  const t = useTranslations("Notifications");
  const [stage, setStage] = useState<Stage>("hidden");
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/push/config");
        if (!res.ok) return;
        const body = (await res.json()) as { configured: boolean; vapidPublicKey?: string };
        if (cancelled) return;
        if (!body.configured || !body.vapidPublicKey) return; // stays hidden
        setVapidPublicKey(body.vapidPublicKey);
        if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
          setStage("unsupported");
          return;
        }
        if (Notification.permission === "denied") {
          setStage("denied");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStage(existing ? "enabled" : "idle");
      } catch {
        // Probing failed (dev without https, worker gone) — leave hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!vapidPublicKey) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStage("denied");
        return;
      }
      if (permission !== "granted") {
        setStage("idle"); // dismissed before answering — offer again
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("subscribe-rejected");
      setStage("subscribed");
    } catch {
      setStage("idle"); // failed mid-flow — keep the entry point available
    }
  }

  if (stage === "hidden") return null;

  const message =
    stage === "unsupported"
      ? t("unsupported")
      : stage === "denied"
        ? t("denied")
        : stage === "enabled"
          ? t("enabled")
          : stage === "subscribed"
            ? t("subscribed")
            : null;

  return (
    <section className="card flex items-center justify-between gap-2 p-4">
      {message ? <p className="min-w-0 flex-1 text-sm text-zinc-700">{message}</p> : null}
      {stage === "idle" ? (
        <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => void enable()}>
          {t("enable")}
        </button>
      ) : null}
    </section>
  );
}
