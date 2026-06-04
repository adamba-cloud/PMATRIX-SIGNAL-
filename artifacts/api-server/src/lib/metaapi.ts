// Trading API: positions, account info, trades
// Confirmed working: mt-client-api-v1.{region}.agiliumtrade.ai
// metaapi.cloud is the marketing website — it does NOT serve REST API requests.
const TRADING_BASE = `https://mt-client-api-v1.${process.env.METAAPI_REGION ?? "london"}.agiliumtrade.ai`;

// Management/Provisioning API: create/deploy/undeploy/delete accounts
// metaapi.cloud is NOT the API — it is the Next.js marketing site and returns HTML.
// The real provisioning endpoint is mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai.
const MANAGEMENT_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

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
    return { status: "SYNCING", message: "Cloud terminal is being provisioned…" };
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
  const body: Record<string, unknown> = {
    login: params.login,
    password: params.password,
    server: params.server,
    platform: "mt5",
    name: params.name,
    magic: 0,
    quoteStreamingIntervalInSeconds: 2.5,
    reliability: "high",
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

export async function deployMetaApiAccount(metaApiId: string): Promise<void> {
  const res = await fetch(`${MANAGEMENT_BASE}/users/current/accounts/${metaApiId}/deploy`, {
    method: "POST",
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi deploy failed (${res.status}): ${text}`);
  }
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
