import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";

export type PushState = "unsupported" | "default" | "loading" | "subscribed" | "denied";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("default");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setState(sub ? "subscribed" : "default");
      })
      .catch(() => setState("default"));
  }, []);

  const subscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    setState("loading");
    try {
      const { publicKey } = await customFetch<{ publicKey: string }>("/api/push/vapid-public-key");

      const reg = await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await customFetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pushSub.toJSON()),
      });

      setState("subscribed");
    } catch (err) {
      console.error("[Push] Subscribe failed:", err);
      setState("default");
    }
  };

  const unsubscribe = async () => {
    if (!("serviceWorker" in navigator)) return;

    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();

      if (pushSub) {
        await customFetch("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: pushSub.endpoint }),
        });
        await pushSub.unsubscribe();
      }

      setState("default");
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
      setState("subscribed");
    }
  };

  return { state, subscribe, unsubscribe };
}
