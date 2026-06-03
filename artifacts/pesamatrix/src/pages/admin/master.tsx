import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Cpu, Wifi, WifiOff, AlertTriangle, RefreshCw, Clock, Server, CheckCircle2, PlayCircle, StopCircle } from "lucide-react";
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

interface MasterConfig {
  accountId: string;
  enabled: boolean;
  accountStatus: MasterAccountStatus | null;
  lastChecked: string | null;
  error: string | null;
}

const MASTER_QUERY_KEY = ["admin-master"];

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

export default function AdminMaster() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery<MasterConfig>({
    queryKey: MASTER_QUERY_KEY,
    queryFn: () => customFetch<MasterConfig>("/api/admin/master"),
    refetchInterval: 15_000,
    staleTime: 10_000,
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
                  Default: <span className="font-mono">99a2b763-0528-4b0e-91ea-79c0be291d5b</span>
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
              {s && !data?.error && (
                <>
                  {s.state === "DEPLOYED" ? (
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
                        s.state === "DEPLOYING" ||
                        s.state === "UNDEPLOYING"
                      }
                      className="gap-1.5 bg-green-700 hover:bg-green-600 text-white"
                    >
                      {deployMutation.isPending || s.state === "DEPLOYING" ? (
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
          ) : data?.error ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Failed to reach MetaApi</p>
                <p className="text-red-400/70 text-sm mt-1">{data.error}</p>
              </div>
            </div>
          ) : s ? (
            <div className="space-y-0 divide-y divide-slate-800">
              <StatusRow label="Connection Status">
                <ConnectionBadge status={s.connectionStatus} />
              </StatusRow>
              <StatusRow label="Deployment Status">
                <DeploymentBadge state={s.state} />
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
              {data?.lastChecked && (
                <StatusRow label="Last Heartbeat">
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

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-slate-400 text-sm">{label}</span>
      <div>{children}</div>
    </div>
  );
}
