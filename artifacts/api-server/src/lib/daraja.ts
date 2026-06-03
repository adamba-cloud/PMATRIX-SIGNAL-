import { logger } from "./logger";

const DARAJA_BASE_URL = "https://api.safaricom.co.ke";

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getDarajaToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }

  const consumerKey = getEnv("DARAJA_CONSUMER_KEY");
  const consumerSecret = getEnv("DARAJA_CONSUMER_SECRET");
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const res = await fetch(
    `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: "GET",
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Daraja OAuth failed");
    throw new Error(`Daraja OAuth error: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: string };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + parseInt(data.expires_in, 10) * 1000,
  };

  return cachedToken.token;
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("7") && digits.length === 9) return `254${digits}`;
  if (digits.startsWith("1") && digits.length === 9) return `254${digits}`;
  throw new Error("Invalid Safaricom phone number. Use format: 07XXXXXXXX or 2547XXXXXXXX");
}

export function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

export function generatePassword(timestamp: string): string {
  const shortCode = getEnv("DARAJA_BUSINESS_SHORTCODE");
  const passkey = getEnv("DARAJA_PASSKEY");
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
}

export interface StkPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export async function initiateStkPush({
  phoneNumber,
  amount,
  accountReference,
  transactionDesc,
  callbackUrl,
}: {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}): Promise<StkPushResult> {
  const token = await getDarajaToken();
  const shortCode = getEnv("DARAJA_BUSINESS_SHORTCODE");
  const timestamp = generateTimestamp();
  const password = generatePassword(timestamp);

  const payload = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.ceil(amount),
    PartyA: phoneNumber,
    PartyB: shortCode,
    PhoneNumber: phoneNumber,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc,
  };

  logger.info({ phoneNumber, amount, accountReference }, "Initiating STK Push");

  const res = await fetch(`${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as StkPushResult & { errorCode?: string; errorMessage?: string };

  if (!res.ok || data.errorCode) {
    logger.error({ status: res.status, data }, "STK Push request failed");
    throw new Error(data.errorMessage ?? `STK Push failed with status ${res.status}`);
  }

  logger.info({ checkoutRequestId: data.CheckoutRequestID }, "STK Push initiated successfully");
  return data;
}

export interface DarajaCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
}

export interface StkQueryResult {
  ResponseCode: string;
  ResultCode: string;
  ResultDesc: string;
}

export async function queryStkStatus(checkoutRequestId: string): Promise<StkQueryResult | null> {
  try {
    const token = await getDarajaToken();
    const shortCode = process.env.DARAJA_BUSINESS_SHORTCODE;
    if (!shortCode) {
      logger.warn("[DARAJA] DARAJA_BUSINESS_SHORTCODE not set — cannot query STK status");
      return null;
    }
    const timestamp = generateTimestamp();
    const password = generatePassword(timestamp);

    logger.info({ checkoutRequestId, ts: new Date().toISOString() }, "[DARAJA] Querying STK status");

    const res = await fetch("https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: shortCode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, checkoutRequestId }, "[DARAJA] STK query non-OK response");
      return null;
    }
    const data = (await res.json()) as StkQueryResult;
    logger.info({ checkoutRequestId, ResultCode: data.ResultCode, ResultDesc: data.ResultDesc }, "[DARAJA] STK query result");
    return data;
  } catch (err) {
    logger.warn({ err, checkoutRequestId }, "[DARAJA] STK query failed");
    return null;
  }
}

export function parseCallback(body: DarajaCallbackBody): {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber: string | null;
  amount: number | null;
  phoneNumber: string | null;
} {
  const cb = body.Body.stkCallback;
  const items = cb.CallbackMetadata?.Item ?? [];

  const get = (name: string) => items.find((i) => i.Name === name)?.Value ?? null;

  return {
    merchantRequestId: cb.MerchantRequestID,
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc,
    mpesaReceiptNumber: get("MpesaReceiptNumber") as string | null,
    amount: get("Amount") as number | null,
    phoneNumber: get("PhoneNumber") != null ? String(get("PhoneNumber")) : null,
  };
}
