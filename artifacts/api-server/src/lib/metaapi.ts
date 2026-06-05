// Trading API: positions, account info, trades
// Confirmed working: mt-client-api-v1.{region}.agiliumtrade.ai
// metaapi.cloud is the marketing website — it does NOT serve REST API requests.
const TRADING_BASE = `https://mt-client-api-v1.${process.env.METAAPI_REGION ?? "london"}.agiliumtrade.ai`;

// Management/Provisioning API: create/deploy/undeploy/delete accounts
// metaapi.cloud is NOT the API — it is the Next.js marketing site and returns HTML.
// The real provisioning endpoint is mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai.
const MANAGEMENT_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// CopyFactory API: strategy configuration and subscriber management
// This is separate from the trading and management APIs.
const COPYFACTORY_BASE = "https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai";

function token(): string {
  const t = process.env.METAAPI_TOKEN;
  if (!t) throw new Error("METAAPI_TOKEN environment variable is not set");
  return t;
}

function headers() {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "auth-token": token(),
  };
}

// ── Friendly error parser ─────────────────────────────────────────────────────
// Translates raw MetaApi error codes / HTTP status codes into human-readable
// messages suitable for display in the UI. Never leaks raw JSON or stack traces.
export function parseMetaApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Auth / invalid credentials
  if (
    lower.includes("invalid credentials") ||
    lower.includes("err_auth_failed") ||
    lower.includes("authentication failed") ||
    lower.includes("wrong password") ||
    lower.includes("invalid login") ||
    (lower.includes("401") && lower.includes("unauthorized"))
  ) {
    return "Invalid MT5 login or password — please double-check your credentials and try again.";
  }

  // Broker server not found / unreachable
  if (
    lower.includes("server not found") ||
    lower.includes("invalid server") ||
    lower.includes("unknown server") ||
    lower.includes("no such server") ||
    (lower.includes("server") && lower.includes("not exist"))
  ) {
    return "Broker server not found — verify the server name in your MT5 terminal (e.g. ICMarkets-Live02).";
  }

  // Account already exists on MetaApi
  if (
    lower.includes("already exists") ||
    lower.includes("duplicate") ||
    lower.includes("conflict")
  ) {
    return "This MT5 account is already registered — if you previously deleted it, wait a few minutes and try again.";
  }

  // Rate limit
  if (lower.includes("429") || lower.includes("too many requests") || lower.includes("rate limit")) {
    return "Too many requests — please wait a moment and try again.";
  }

  // Connection timeout / broker offline
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("connection refused") ||
    lower.includes("err_connection")
  ) {
    return "Connection timed out — the broker server may be temporarily offline. Please try again in a few minutes.";
  }

  // MetaApi token / platform auth issue
  if (lower.includes("auth-token") || lower.includes("invalid token") || lower.includes("token expired")) {
    return "Platform authentication error — please contact support.";
  }

  // MetaApi service errors (5xx)
  if (
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("service unavailable") ||
    lower.includes("internal server error")
  ) {
    return "MetaApi service is temporarily unavailable — please try again in a few minutes.";
  }

  // MetaApi token not configured
  if (lower.includes("metaapi_token")) {
    return "Copy-trading is not configured on this platform yet. Please contact support.";
  }

  // Fallback — still friendly, no raw code
  return "Failed to connect the cloud terminal. Please check your details and try again, or contact support if the issue persists.";
}

// ── Retry with exponential backoff ────────────────────────────────────────────
// Only retries transient errors (5xx, network). Credential / validation errors
// (4xx) are not retried — they will fail immediately on every attempt.
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const raw = err instanceof Error ? err.message : String(err);
      const lower = raw.toLowerCase();

      // Don't retry client errors — they won't change
      const isClientError =
        lower.includes("401") ||
        lower.includes("400") ||
        lower.includes("409") ||
        lower.includes("422") ||
        lower.includes("invalid credentials") ||
        lower.includes("server not found") ||
        lower.includes("already exists");

      if (isClientError || attempt === maxAttempts) break;

      const delay = baseDelayMs * Math.pow(2, attempt - 1); // 2s, 4s
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export interface MetaApiAccountState {
  id: string;
  login: string;
  server: string;
  platform: string;
  name: string;
  state: "DEPLOYED" | "UNDEPLOYED" | "DEPLOYING" | "UNDEPLOYING" | "ERROR";
  connectionStatus: "CONNECTED" | "DISCONNECTED" | "CONNECTING";
  synchronizationStatus: "SYNCHRONIZED" | "SYNCHRONIZING";
  broker?: string;
  currency?: string;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  leverage?: number;
  tradeAllowed?: boolean;
  accountCurrencyExchangeRate?: number;
}

export type LocalMt5Status = "CONNECTED" | "SYNCING" | "DISCONNECTED" | "ERROR";

export function mapMetaApiStatus(account: MetaApiAccountState): {
  status: LocalMt5Status;
  message: string;
} {
  const { state, connectionStatus, synchronizationStatus } = account;

  if (state === "ERROR") {
    return { status: "ERROR", message: "MetaApi reported an error with this account." };
  }
  if (state === "UNDEPLOYED") {
    return { status: "DISCONNECTED", message: "Cloud terminal is undeployed." };
  }
  if (state === "DEPLOYING" || state === "UNDEPLOYING") {
    return { status: "SYNCING", message: "Deploying cloud terminal — this usually takes 2–5 minutes." };
  }
  if (state === "DEPLOYED") {
    if (connectionStatus === "CONNECTED" && synchronizationStatus === "SYNCHRONIZED") {
      return { status: "CONNECTED", message: "Cloud terminal is connected and synchronized." };
    }
    if (connectionStatus === "CONNECTING") {
      return { status: "SYNCING", message: "Establishing connection to broker server…" };
    }
    if (synchronizationStatus === "SYNCHRONIZING") {
      return { status: "SYNCING", message: "Synchronizing account data — this usually takes 1–2 minutes." };
    }
    if (connectionStatus === "DISCONNECTED") {
      return { status: "DISCONNECTED", message: "Disconnected from broker. Check your credentials." };
    }
  }
  return { status: "SYNCING", message: "Provisioning Cloud Terminal…" };
}

export async function createMetaApiAccount(params: {
  login: string;
  password: string;
  server: string;
  name: string;
  webhookUrl?: string;
}): Promise<{ id: string }> {
  return withRetry(async () => {
    const body: Record<string, unknown> = {
      login: params.login,
      password: params.password,
      server: params.server,
      platform: "mt5",
      name: params.name,
      magic: 0,
      quoteStreamingIntervalInSeconds: 2.5,
      reliability: "regular",
    };
    if (params.webhookUrl) {
      body.webhookUrl = params.webhookUrl;
    }

    const res = await fetch(`${MANAGEMENT_BASE}/users/current/accounts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MetaApi createAccount failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id: string };
    return { id: data.id };
  });
}

// ── Account info via trading API ──────────────────────────────────────────────
// The trading API's /accountInformation endpoint returns real-time balance,
// equity, leverage, broker, and server info. State/connection are synthesised:
// if the call succeeds the account is reachable → DEPLOYED / CONNECTED / SYNCHRONIZED.

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  tradeAllowed: boolean;
  name: string;
  login: number;
  credit?: number;
}

export async function getMetaApiAccount(metaApiId: string): Promise<MetaApiAccountState> {
  const res = await fetch(
    `${TRADING_BASE}/users/current/accounts/${metaApiId}/accountInformation`,
    { headers: headers() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi getAccount failed (${res.status}): ${text}`);
  }

  const info = (await res.json()) as AccountInformation;

  return {
    id: metaApiId,
    login: String(info.login),
    server: info.server,
    platform: info.platform,
    name: info.name,
    // If we got a 200, the account is live and reachable
    state: "DEPLOYED",
    connectionStatus: "CONNECTED",
    synchronizationStatus: "SYNCHRONIZED",
    broker: info.broker,
    currency: info.currency,
    balance: info.balance,
    equity: info.equity,
    margin: info.margin,
    freeMargin: info.freeMargin,
    leverage: info.leverage,
    tradeAllowed: info.tradeAllowed,
  };
}

// ── Management API state (provisioning phase) ─────────────────────────────────
// Use this during provisioning (SYNCING) — the trading API only responds once
// the terminal is CONNECTED, so calling it too early returns a 4xx error.
// The management API returns state (DEPLOYING/DEPLOYED/ERROR) at any phase.
export async function getMetaApiAccountManagementState(
  metaApiId: string,
): Promise<MetaApiAccountState> {
  const res = await fetch(`${MANAGEMENT_BASE}/users/current/accounts/${metaApiId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi getAccount (mgmt) failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<MetaApiAccountState>;
}

export async function deployMetaApiAccount(metaApiId: string): Promise<void> {
  return withRetry(async () => {
    const res = await fetch(`${MANAGEMENT_BASE}/users/current/accounts/${metaApiId}/deploy`, {
      method: "POST",
      headers: headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MetaApi deploy failed (${res.status}): ${text}`);
    }
  });
}

export async function undeployMetaApiAccount(metaApiId: string): Promise<void> {
  const res = await fetch(`${MANAGEMENT_BASE}/users/current/accounts/${metaApiId}/undeploy`, {
    method: "POST",
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi undeploy failed (${res.status}): ${text}`);
  }
}

export interface MetaApiPosition {
  id: string;
  symbol: string;
  type: "POSITION_TYPE_BUY" | "POSITION_TYPE_SELL";
  volume: number;
  openPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit?: number;
  comment?: string;
}

export interface MetaApiTradeResult {
  numericCode: number;
  stringCode: string;
  message: string;
  orderId?: string;
}

export async function getAccountBalance(metaApiId: string): Promise<number | null> {
  const account = await getMetaApiAccount(metaApiId);
  return account.balance ?? null;
}

export async function getAccountPositions(metaApiId: string): Promise<MetaApiPosition[]> {
  const res = await fetch(
    `${TRADING_BASE}/users/current/accounts/${metaApiId}/positions`,
    { headers: headers() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi getPositions failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<MetaApiPosition[]>;
}

export async function placeTrade(
  metaApiId: string,
  params: {
    actionType: "ORDER_TYPE_BUY" | "ORDER_TYPE_SELL";
    symbol: string;
    volume: number;
    stopLoss?: number;
    takeProfit?: number;
    comment?: string;
  }
): Promise<MetaApiTradeResult> {
  const res = await fetch(`${TRADING_BASE}/users/current/accounts/${metaApiId}/trade`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi placeTrade failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<MetaApiTradeResult>;
}

export async function deleteMetaApiAccount(metaApiId: string): Promise<void> {
  const res = await fetch(`${MANAGEMENT_BASE}/users/current/accounts/${metaApiId}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`MetaApi deleteAccount failed (${res.status}): ${text}`);
  }
}

// ── CopyFactory API ───────────────────────────────────────────────────────────
// Manages trade-copying strategies and subscriber accounts.
// Every slave account must be registered as a CopyFactory subscriber and
// pointed at the master's strategy before MetaApi will copy trades.
//
// Strategy ID convention: we use a fixed, human-readable ID ("pesamatrix") so
// the same strategy is updated idempotently on every master re-save. The API
// uses PUT, so it creates or updates in one call.
// Subscriber ID = the slave's MetaApi account ID (MetaApi requires this).

export interface CopyFactoryStrategyBody {
  name: string;
  description: string;
  positionLifecycle: string;
  connectionId: string;
  timeSettings: {
    lifetimeInHours: number;
    openingIntervalInMinutes: number;
  };
}

export interface CopyFactorySubscriberBody {
  name: string;
  subscriptions: Array<{
    strategyId: string;
    multiplier: number;
  }>;
}

/**
 * Create or update the CopyFactory strategy that the master account publishes.
 * Logs the full request payload and raw response for diagnostics.
 */
export async function createOrUpdateCopyFactoryStrategy(
  strategyId: string,
  masterMetaApiId: string,
  name = "PESAMATRIX Master Strategy"
): Promise<void> {
  const body: CopyFactoryStrategyBody = {
    name,
    description: "Automated copy trading strategy managed by PESAMATRIX Signal",
    positionLifecycle: "auto",
    connectionId: masterMetaApiId,
    timeSettings: {
      lifetimeInHours: 876000,   // ~100 years — never expires
      openingIntervalInMinutes: 5,
    },
  };

  const url = `${COPYFACTORY_BASE}/users/current/configuration/strategies/${strategyId}`;
  console.log("[CopyFactory] createOrUpdateStrategy — REQUEST", JSON.stringify({ url, body }, null, 2));

  const res = await fetch(url, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  console.log("[CopyFactory] createOrUpdateStrategy — RESPONSE", res.status, responseText);

  if (!res.ok) {
    throw new Error(`CopyFactory createStrategy failed (${res.status}): ${responseText}`);
  }
}

/**
 * Register a slave account as a CopyFactory subscriber pointing at the given strategy.
 * subscriberId MUST equal the slave's MetaApi account ID — MetaApi enforces this.
 */
export async function createOrUpdateCopyFactorySubscriber(
  subscriberId: string,
  strategyId: string,
  name: string
): Promise<void> {
  const body: CopyFactorySubscriberBody = {
    name,
    subscriptions: [
      {
        strategyId,
        multiplier: 1,
      },
    ],
  };

  const url = `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${subscriberId}`;
  console.log("[CopyFactory] createOrUpdateSubscriber — REQUEST", JSON.stringify({ url, strategyId, body }, null, 2));

  const res = await fetch(url, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  console.log("[CopyFactory] createOrUpdateSubscriber — RESPONSE", res.status, responseText);

  if (!res.ok) {
    throw new Error(`CopyFactory updateSubscriber failed (${res.status}): ${responseText}`);
  }
}

/**
 * Remove a slave account from CopyFactory so it stops receiving copied trades.
 * Called when a slave account is deleted or its subscription expires.
 * 404 is treated as success (already gone).
 */
export async function deleteCopyFactorySubscriber(subscriberId: string): Promise<void> {
  const url = `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${subscriberId}`;
  console.log("[CopyFactory] deleteSubscriber — REQUEST", url);

  const res = await fetch(url, {
    method: "DELETE",
    headers: headers(),
  });

  const responseText = await res.text();
  console.log("[CopyFactory] deleteSubscriber — RESPONSE", res.status, responseText);

  if (!res.ok && res.status !== 404) {
    throw new Error(`CopyFactory deleteSubscriber failed (${res.status}): ${responseText}`);
  }
}

/** List all CopyFactory strategies for the current MetaApi token. */
export async function listCopyFactoryStrategies(): Promise<unknown[]> {
  const url = `${COPYFACTORY_BASE}/users/current/configuration/strategies`;
  const res = await fetch(url, { headers: headers() });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CopyFactory listStrategies failed (${res.status}): ${text}`);
  }

  return JSON.parse(text) as unknown[];
}

/** List all CopyFactory subscribers for the current MetaApi token. */
export async function listCopyFactorySubscribers(): Promise<unknown[]> {
  const url = `${COPYFACTORY_BASE}/users/current/configuration/subscribers`;
  const res = await fetch(url, { headers: headers() });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CopyFactory listSubscribers failed (${res.status}): ${text}`);
  }

  return JSON.parse(text) as unknown[];
}
