import webpush from "web-push";
import { logger } from "./logger";

let _publicKey: string;
let _privateKey: string;
let _initialized = false;

function init() {
  if (_initialized) return;
  _initialized = true;

  const pub = process.env["VAPID_PUBLIC_KEY"];
  const priv = process.env["VAPID_PRIVATE_KEY"];

  if (pub && priv) {
    _publicKey = pub;
    _privateKey = priv;
  } else {
    const keys = webpush.generateVAPIDKeys();
    _publicKey = keys.publicKey;
    _privateKey = keys.privateKey;
    logger.warn(
      {
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: keys.privateKey,
      },
      "VAPID keys not configured — generated temporary keys. " +
        "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as environment secrets to persist them."
    );
  }

  webpush.setVapidDetails("mailto:admin@pesamatrix.com", _publicKey, _privateKey);
}

export function getVapidPublicKey(): string {
  init();
  return _publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<"ok" | "stale" | "error"> {
  init();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }
    );
    return "ok";
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      return "stale";
    }
    logger.error({ err, endpoint: sub.endpoint }, "Push send failed");
    return "error";
  }
}

export async function broadcastPush(
  subs: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload
): Promise<{ sent: number; failed: number; staleIds: number[] }> {
  let sent = 0;
  let failed = 0;
  const staleIds: number[] = [];

  for (const sub of subs) {
    const result = await sendPush(sub, payload);
    if (result === "ok") sent++;
    else if (result === "stale") staleIds.push(sub.id);
    else failed++;
  }

  return { sent, failed, staleIds };
}
