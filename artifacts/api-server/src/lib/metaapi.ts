const BASE = "https://metaapi.cloud";

function token(): string {
  const t = process.env.METAAPI_TOKEN;
  if (!t) throw new Error("METAAPI_TOKEN environment variable is not set");
  return t;
}

function headers() {
  return {
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

  const res = await fetch(`${BASE}/users/current/accounts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MetaApi createAccount failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export async function getMetaApiAccount(metaApiId: string): Promise<MetaApiAccountState> {
  const res = await fetch(`${BASE}/users/current/accounts/${metaApiId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MetaApi getAccount failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<MetaApiAccountState>;
}

export async function deployMetaApiAccount(metaApiId: string): Promise<void> {
  const res = await fetch(`${BASE}/users/current/accounts/${metaApiId}/deploy`, {
    method: "POST",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MetaApi deploy failed (${res.status}): ${body}`);
  }
}

export async function undeployMetaApiAccount(metaApiId: string): Promise<void> {
  const res = await fetch(`${BASE}/users/current/accounts/${metaApiId}/undeploy`, {
    method: "POST",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MetaApi undeploy failed (${res.status}): ${body}`);
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

export async function getAccountPositions(metaApiId: string): Promise<MetaApiPosition[]> {
  const res = await fetch(`${BASE}/users/current/accounts/${metaApiId}/positions`, {
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MetaApi getPositions failed (${res.status}): ${body}`);
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
  const res = await fetch(`${BASE}/users/current/accounts/${metaApiId}/trade`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MetaApi placeTrade failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<MetaApiTradeResult>;
}

export async function deleteMetaApiAccount(metaApiId: string): Promise<void> {
  const res = await fetch(`${BASE}/users/current/accounts/${metaApiId}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`MetaApi deleteAccount failed (${res.status}): ${body}`);
  }
}
