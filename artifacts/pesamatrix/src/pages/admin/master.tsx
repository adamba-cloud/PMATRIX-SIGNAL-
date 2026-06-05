import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Cpu, Wifi, WifiOff, AlertTriangle, RefreshCw, Clock, Server, CheckCircle2, PlayCircle, StopCircle, Zap, Users, ShieldCheck, ShieldX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface MasterAccountStatus {
  state: "DEPLOYED" | "UNDEPLOYED" | "DEPLOYING" | "UNDEPLOYING" | "ERROR";
  connectionStatus: "CONNECTED" | "DISCONNECTED" | "CONNECTING";
  synchronizationStatus: "SYNCHRONIZED" | "SYNCHRONIZING";
  login?: string;
  server?: string;
  platform?: string;
  name?: string;
  broker?: string;
  balance?: number;
  equity?: number;
  leverage?: number;
}

interface ManagementState {
  state: "DEPLOYED" | "UNDEPLOYED" | "DEPLOYING" | "UNDEPLOYING" | "ERROR";
  server?: string;
  login?: string;
  name?: string;
}

interface MasterConfig {
  accountId: string | null;
  enabled: boolean;
  accountStatus: MasterAccountStatus | null;
  managementState: ManagementState | null;
  lastChecked: string | null;
  error: string | null;
}

interface CopyFactoryDiagnostic {
  systemConfig: {
    masterMetaApiAccountId: string | null;
    copyFactoryStrategyId: string | null;
    masterEnabled: string;
  };
  copyFactory: {
    strategyCount: number;
    subscriberCount: number;
    strategies: unknown[];
    subscribers: unknown[];
  };
  slaveAccounts: Array<{
    id: number;
    mt5Login: string;
    metaApiAccountId: string | null;
    status: string;
    registeredInCopyFactory: boolean;
  }>;
  errors: Record<string, string>;
  diagnosis: {
    strategyExists: boolean;
    masterIdConfigured: boolean;
    strategyIdSaved: boolean;
    slavesWithoutSubscription: Array<{ id: number; mt5Login: string; metaApiAccountId: string | null }>;
  };
}

interface SetupResult {
  ok: boolean;
  summary: {
    strategyCreated: boolean;
    subscribersAttempted: number;
    subscribersSucceeded: number;
    subscribersFailed: number;
  };
}

const MASTER_QUERY_KEY = ["admin-master"];
const CF_DIAGNOSTIC_KEY = ["copyfactory-diagnostic"];

function ConnectionBadge({ status }: { status: MasterAccountStatus["connectionStatus"] }) {
  if (status === "CONNECTED") {
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/30 gap-1.5">
        <Wifi className="w-3 h-3" /> Connected
      </Badge>
    );
  }
  if (status === "CONNECTING") {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Connecting
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/10 text-red-400 border-red-500/30 gap-1.5">
      <WifiOff className="w-3 h-3" /> Disconnected
    </Badge>
  );
}

function DeploymentBadge({ state }: { state: MasterAccountStatus["state"] }) {
  if (state === "DEPLOYED") {
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/30 gap-1.5">
        <CheckCircle2 className="w-3 h-3" /> Deployed
      </Badge>
    );
  }
  if (state === "DEPLOYING" || state === "UNDEPLOYING") {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        {state === "DEPLOYING" ? "Deploying…" : "Undeploying…"}
      </Badge>
    );
  }
  if (state === "ERROR") {
    return (
      <Badge className="bg-red-500/10 text-red-400 border-red-500/30 gap-1.5">
        <AlertTriangle className="w-3 h-3" /> Error
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-700/50 text-slate-400 border-slate-600 gap-1.5">
      <Server className="w-3 h-3" /> Undeployed
    </Badge>
  );
}

function ManagementStateBadge({ state }: { state: ManagementState["state"] }) {
  if (state === "DEPLOYED") {
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/30 gap-1.5">
        <CheckCircle2 className="w-3 h-3" /> Deployed
      </Badge>
    );
  }
  if (state === "DEPLOYING") {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Deploying…
      </Badge>
    );
  }
  if (state === "UNDEPLOYING") {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Undeploying…
      </Badge>
    );
  }
  if (state === "ERROR") {
    return (
      <Badge className="bg-red-500/10 text-red-400 border-red-500/30 gap-1.5">
        <AlertTriangle className="w-3 h-3" /> Error
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-700/50 text-slate-400 border-slate-600 gap-1.5">
      <Server className="w-3 h-3" /> Undeployed
    </Badge>
  );
}

export default function AdminMaster() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery<MasterConfig>({
    queryKey: MASTER_QUERY_KEY,
    queryFn: () => customFetch<MasterConfig>("/api/admin/master"),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: cfData, isLoading: cfLoading, isFetching: cfFetching } = useQuery<CopyFactoryDiagnostic>({
    queryKey: CF_DIAGNOSTIC_KEY,
    queryFn: () => customFetch<CopyFactoryDiagnostic>("/api/admin/copyfactory/diagnostic"),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const setupMutation = useMutation<SetupResult, unknown>({
    mutationFn: () =>
      customFetch<SetupResult>("/api/admin/copyfactory/setup", { method: "POST" }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CF_DIAGNOSTIC_KEY });
      const { strategyCreated, subscribersSucceeded, subscribersFailed, subscribersAttempted } = result.summary;
      if (strategyCreated) {
        toast({
          title: "CopyFactory strategy created",
          description: subscribersAttempted > 0
            ? `Strategy active. ${subscribersSucceeded}/${subscribersAttempted} slave accounts subscribed${subscribersFailed > 0 ? ` (${subscribersFailed} failed — check server logs)` : ""}.`
            : "Strategy active. No slave accounts found to subscribe.",
        });
      } else {
        toast({
          title: "Strategy creation failed",
          description: "Strategy was not created. Check Admin → Server Logs for the exact MetaApi error.",
          variant: "destructive",
        });
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Setup failed";
      toast({ title: "CopyFactory setup failed", description: msg, variant: "destructive" });
    },
  });

  const [accountId, setAccountId] = useState<string | null>(null);
  const effectiveAccountId = accountId ?? data?.accountId ?? "";

  const saveAccountIdMutation = useMutation({
    mutationFn: (id: string) =>
      customFetch("/api/admin/master", { method: "PUT", body: JSON.stringify({ accountId: id }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY });
      setAccountId(null);
      toast({ title: "Account ID saved", description: "Master account updated successfully." });
    },
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to save";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    },
  });

  const deployMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/master/deploy", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY });
      toast({ title: "Deploy triggered", description: "MetaApi account deployment started." });
    },
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Deploy failed";
      toast({ title: "Deploy failed", description: msg, variant: "destructive" });
    },
  });

  const undeployMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/master/undeploy", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY });
      toast({ title: "Undeploy triggered", description: "MetaApi account is being undeployed." });
    },
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Undeploy failed";
      toast({ title: "Undeploy failed", description: msg, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      customFetch("/api/admin/master", { method: "PUT", body: JSON.stringify({ enabled }) }),
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY });
      toast({
        title: enabled ? "Master Enabled" : "Master Disabled",
        description: enabled
          ? "Copy trading will now run from the master account."
          : "Copy trading has been paused.",
      });
    },
    onError: () => toast({ title: "Toggle failed", variant: "destructive" }),
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY });
  }, [queryClient]);

  const s = data?.accountStatus;
  const ms = data?.managementState; // authoritative state from management API
  const effectiveState = ms?.state ?? s?.state;
  const isDirty = accountId !== null && accountId !== data?.accountId;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-50">Master Account</h2>
          <p className="text-slate-400 mt-1">
            Configure the MetaApi master account used for copy trading signals.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="gap-2 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Config Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50 flex items-center gap-2 text-base">
            <Cpu className="w-4 h-4 text-green-500" />
            MetaApi Account ID
          </CardTitle>
          <CardDescription className="text-slate-400">
            Only one master account can be active at a time. This account's trades are copied to all slave accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="master-id" className="text-slate-300">MetaApi Account ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="master-id"
                    value={effectiveAccountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="font-mono text-sm bg-slate-950 border-slate-700 text-white focus:border-green-500 focus-visible:ring-green-500/30 flex-1"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <Button
                    onClick={() => saveAccountIdMutation.mutate(effectiveAccountId)}
                    disabled={!isDirty || saveAccountIdMutation.isPending}
                    className="bg-green-600 hover:bg-green-500 text-white shrink-0 disabled:opacity-50"
                  >
                    {saveAccountIdMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Find your MetaApi Account ID in the{" "}
                  <a
                    href="https://app.metaapi.cloud/accounts"
                    target="_blank"
                    rel="noreferrer"
                    className="text-green-500 hover:text-green-400 underline underline-offset-2"
                  >
                    MetaApi dashboard
                  </a>
                  .
                </p>
              </div>

              {/* Master Enabled Toggle */}
              <div className="flex items-center justify-between py-3 border-t border-slate-800">
                <div>
                  <p className="text-slate-200 font-medium">Master Enabled</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    When disabled, no trades are copied from this account to slaves.
                  </p>
                </div>
                <Switch
                  checked={data?.enabled ?? true}
                  onCheckedChange={(val) => toggleMutation.mutate(val)}
                  disabled={toggleMutation.isPending}
                  className="data-[state=checked]:bg-green-600"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* CopyFactory Strategy Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-50 flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-green-500" />
              CopyFactory Strategy
            </CardTitle>
            <div className="flex items-center gap-2">
              {cfFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
              <Button
                size="sm"
                onClick={() => setupMutation.mutate()}
                disabled={setupMutation.isPending || !cfData?.diagnosis.masterIdConfigured}
                className="gap-1.5 bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"
              >
                {setupMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                {cfData?.diagnosis.strategyExists ? "Re-sync All" : "Create Strategy"}
              </Button>
            </div>
          </div>
          <CardDescription className="text-slate-400">
            MetaApi CopyFactory replicates trades from the master account to all slave accounts automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cfLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Strategy status row */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 text-sm">Strategy Status</span>
                {cfData?.diagnosis.strategyExists ? (
                  <Badge className="bg-green-500/10 text-green-400 border-green-500/30 gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Active ({cfData.copyFactory.strategyCount})
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/10 text-red-400 border-red-500/30 gap-1.5">
                    <ShieldX className="w-3 h-3" /> Not created
                  </Badge>
                )}
              </div>

              {/* Subscribers row */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 text-sm">Subscribers (slave accounts)</span>
                <Badge className="bg-slate-700/50 text-slate-300 border-slate-600 gap-1.5">
                  <Users className="w-3 h-3" /> {cfData?.copyFactory.subscriberCount ?? 0}
                </Badge>
              </div>

              {/* Strategy ID row */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 text-sm">Strategy ID (saved in DB)</span>
                <span className="font-mono text-xs text-slate-300">
                  {cfData?.systemConfig.copyFactoryStrategyId ?? <span className="text-red-400">not set</span>}
                </span>
              </div>

              {/* Slaves without subscription */}
              {cfData?.diagnosis.slavesWithoutSubscription && cfData.diagnosis.slavesWithoutSubscription.length > 0 && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                  <p className="text-yellow-400 text-sm font-medium flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {cfData.diagnosis.slavesWithoutSubscription.length} slave account(s) not subscribed to CopyFactory
                  </p>
                  <ul className="space-y-1">
                    {cfData.diagnosis.slavesWithoutSubscription.map((s) => (
                      <li key={s.id} className="text-xs text-yellow-400/70 font-mono">
                        Login {s.mt5Login} — MetaApi ID: {s.metaApiAccountId ?? "not provisioned"}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-yellow-400/60 mt-2">Click "Re-sync All" above to subscribe them.</p>
                </div>
              )}

              {/* All subscribed */}
              {cfData && cfData.diagnosis.strategyExists &&
                cfData.diagnosis.slavesWithoutSubscription.length === 0 &&
                cfData.slaveAccounts.length > 0 && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
                  <p className="text-green-400 text-sm">
                    All {cfData.slaveAccounts.filter(s => s.metaApiAccountId).length} provisioned slave account(s) are subscribed to CopyFactory.
                  </p>
                </div>
              )}

              {/* Strategy not created warning */}
              {cfData && !cfData.diagnosis.strategyExists && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-red-400 text-sm font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    No CopyFactory strategy exists yet
                  </p>
                  <p className="text-red-400/70 text-xs mt-1">
                    Click "Create Strategy" to create the strategy and subscribe all slave accounts.
                    The master MetaApi Account ID must be saved first.
                  </p>
                </div>
              )}

              {/* Errors from MetaApi */}
              {cfData && Object.keys(cfData.errors).length > 0 && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-1">
                  <p className="text-red-400 text-sm font-medium">MetaApi errors</p>
                  {Object.entries(cfData.errors).map(([k, v]) => (
                    <p key={k} className="text-xs text-red-400/70 font-mono">{k}: {v}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Status Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-50 flex items-center gap-2 text-base">
              <Wifi className="w-4 h-4 text-green-500" />
              Live Status
            </CardTitle>
            <div className="flex items-center gap-2">
              {data?.lastChecked && (
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Last heartbeat {formatDistanceToNow(new Date(data.lastChecked), { addSuffix: true })}
                </span>
              )}
              {(s || ms) && (
                <>
                  {effectiveState === "DEPLOYED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => undeployMutation.mutate()}
                      disabled={undeployMutation.isPending || deployMutation.isPending}
                      className="gap-1.5 border-red-700 text-red-400 hover:bg-red-950 hover:text-red-300 hover:border-red-600"
                    >
                      {undeployMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <StopCircle className="w-3.5 h-3.5" />
                      )}
                      Undeploy
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => deployMutation.mutate()}
                      disabled={
                        deployMutation.isPending ||
                        undeployMutation.isPending ||
                        effectiveState === "DEPLOYING" ||
                        effectiveState === "UNDEPLOYING"
                      }
                      className="gap-1.5 bg-green-700 hover:bg-green-600 text-white"
                    >
                      {deployMutation.isPending || effectiveState === "DEPLOYING" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <PlayCircle className="w-3.5 h-3.5" />
                      )}
                      Deploy
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <CardDescription className="text-slate-400">
            Real-time status fetched directly from MetaApi. Refreshes every 15 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : (s || ms) ? (
            <div className="space-y-0 divide-y divide-slate-800">

              {/* ── Management API row — always shown, always accurate ── */}
              {ms && (
                <StatusRow label={
                  <span className="flex items-center gap-1.5">
                    Cloud Terminal
                    <span className="text-[10px] text-green-600 font-semibold uppercase tracking-wide bg-green-500/10 border border-green-500/20 rounded px-1 py-0.5">live</span>
                  </span>
                }>
                  <ManagementStateBadge state={ms.state} />
                </StatusRow>
              )}

              {/* ── Trading API rows — only available when account is connected ── */}
              {s ? (
                <>
                  <StatusRow label="Broker Connection">
                    <ConnectionBadge status={s.connectionStatus} />
                  </StatusRow>
                  <StatusRow label="Synchronization">
                    <Badge
                      className={
                        s.synchronizationStatus === "SYNCHRONIZED"
                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                          : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1.5"
                      }
                    >
                      {s.synchronizationStatus === "SYNCHRONIZED" ? (
                        "Synchronized"
                      ) : (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Synchronizing</>
                      )}
                    </Badge>
                  </StatusRow>
                  {s.name && <StatusRow label="Account Name"><span className="text-slate-200">{s.name}</span></StatusRow>}
                  {s.login && <StatusRow label="Login"><span className="font-mono text-slate-200">{s.login}</span></StatusRow>}
                  {s.server && <StatusRow label="Broker Server"><span className="text-slate-200">{s.server}</span></StatusRow>}
                  {s.broker && <StatusRow label="Broker"><span className="text-slate-200">{s.broker}</span></StatusRow>}
                  {s.platform && <StatusRow label="Platform"><span className="text-slate-300 uppercase text-xs font-semibold">{s.platform}</span></StatusRow>}
                  {s.balance != null && (
                    <StatusRow label="Balance">
                      <span className="text-slate-200 font-semibold">{s.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </StatusRow>
                  )}
                  {s.equity != null && (
                    <StatusRow label="Equity">
                      <span className="text-slate-200">{s.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </StatusRow>
                  )}
                  {s.leverage != null && (
                    <StatusRow label="Leverage">
                      <span className="text-slate-300">1:{s.leverage}</span>
                    </StatusRow>
                  )}
                </>
              ) : (
                /* Trading API unavailable — account is offline */
                <div className="py-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-slate-300 text-sm font-medium">Broker data unavailable</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {ms?.state === "UNDEPLOYED"
                          ? "Account is undeployed. Click Deploy to start the cloud terminal."
                          : "Balance, positions, and broker info load only when the account is connected."}
                      </p>
                      {data?.error && (
                        <p className="text-yellow-400/60 text-xs mt-1.5 font-mono leading-relaxed">{data.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Server info from management API when trading API is down */}
              {!s && ms?.server && (
                <StatusRow label="Broker Server"><span className="text-slate-200">{ms.server}</span></StatusRow>
              )}
              {!s && ms?.login && (
                <StatusRow label="Login"><span className="font-mono text-slate-200">{ms.login}</span></StatusRow>
              )}

              {data?.lastChecked && (
                <StatusRow label="Last Checked">
                  <span className="text-slate-300 text-sm">{new Date(data.lastChecked).toLocaleTimeString()}</span>
                </StatusRow>
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500">
              <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No account status available.</p>
              <p className="text-sm mt-1">Enter a MetaApi Account ID above to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-slate-400 text-sm">{label}</span>
      <div>{children}</div>
    </div>
  );
}
