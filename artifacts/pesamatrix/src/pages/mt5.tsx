import { useState, useEffect, useCallback, useRef } from "react";
import {
  useGetMt5Accounts,
  useConnectMt5Account,
  useDeleteMt5Account,
  useReconnectMt5Account,
  getGetMt5AccountsQueryKey,
} from "@workspace/api-client-react";
import type { SlaveAccount } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMt5WebSocket, type Mt5StatusPush } from "@/hooks/useMt5WebSocket";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Cpu,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
  Activity,
  Cloud,
  TrendingUp,
  DollarSign,
  Shield,
  ChevronDown,
} from "lucide-react";

// ─── Broker server list ───────────────────────────────────────────────────────
// Common MT5 broker servers, especially popular in Kenya / East Africa.
// Users can always type any server name not in this list.
const BROKER_SERVERS: { broker: string; servers: string[] }[] = [
  {
    broker: "Exness",
    servers: [
      "Exness-MT5Real",
      "Exness-MT5Real2",
      "Exness-MT5Real4",
      "Exness-MT5Real6",
      "Exness-MT5Real8",
      "Exness-MT5Real10",
      "Exness-MT5Trial1",
    ],
  },
  {
    broker: "XM / XMTrading",
    servers: ["XMTrading-MT5 1", "XMTrading-MT5 2", "XMTrading-MT5 3", "XM-Real", "XM-Demo"],
  },
  {
    broker: "ICMarkets",
    servers: ["ICMarkets-MT5-2", "ICMarkets-Live02", "ICMarkets-Demo01", "ICMarketsSC-MT5-2"],
  },
  {
    broker: "Pepperstone",
    servers: ["Pepperstone-MT5-Live01", "Pepperstone-Demo01", "PepperstoneSC-MT5-Live01"],
  },
  {
    broker: "HFM / HotForex",
    servers: ["HFMarkets-MT5Live", "HFMarkets-MT5Demo", "HFMarketsKE-MT5Live"],
  },
  {
    broker: "FXTM / ForexTime",
    servers: ["FXTM-Real11", "FXTM-MT5 Demo", "ForexTimeFXTM-Server"],
  },
  {
    broker: "OctaFX",
    servers: ["OctaFX-MT5", "OctaFX-Demo"],
  },
  {
    broker: "Deriv",
    servers: ["DerivSVG-Server", "Deriv-Server", "DerivFX-Server"],
  },
  {
    broker: "FBS",
    servers: ["FBS-Real", "FBS-Demo", "FBSPrime-Real"],
  },
  {
    broker: "Avatrade",
    servers: ["AvaTrade-MT5", "AvaTrade-MT5 1"],
  },
  {
    broker: "OANDA",
    servers: ["OANDA-v20 Live-1", "OANDA-v20 Practice-1"],
  },
  {
    broker: "FxPro",
    servers: ["FxPro-MT5-Trial", "FxPro-MT5Real7"],
  },
];

const ALL_SERVERS = BROKER_SERVERS.flatMap((g) => g.servers);

// ─── Broker server combobox ───────────────────────────────────────────────────
function BrokerServerInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim().length === 0
    ? ALL_SERVERS
    : ALL_SERVERS.filter((s) => s.toLowerCase().includes(value.toLowerCase()));

  // Close when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          id="brokerServer"
          placeholder="e.g. Exness-MT5Real8"
          value={value}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          className={`bg-slate-800 border-slate-700 text-slate-50 placeholder:text-slate-500 pr-8 ${error ? "border-red-500/60" : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-slate-700 bg-slate-800 shadow-xl max-h-52 overflow-y-auto">
          {BROKER_SERVERS.map((group) => {
            const visible = group.servers.filter((s) =>
              value.trim().length === 0 || s.toLowerCase().includes(value.toLowerCase())
            );
            if (visible.length === 0) return null;
            return (
              <div key={group.broker}>
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-900/60 sticky top-0">
                  {group.broker}
                </p>
                {visible.map((server) => (
                  <button
                    key={server}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${
                      value === server ? "text-green-400 bg-green-500/10" : "text-slate-200"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(server);
                      setOpen(false);
                    }}
                  >
                    {server}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Mt5Status = "CONNECTED" | "SYNCING" | "DISCONNECTED" | "ERROR";

interface Telemetry {
  connectionStatus?: string;
  synchronizationStatus?: string;
  state?: string;
  balance?: number | null;
  equity?: number | null;
  margin?: number | null;
  freeMargin?: number | null;
  leverage?: number | null;
  currency?: string | null;
  broker?: string | null;
  tradeAllowed?: boolean | null;
}

interface AccountWithTelemetry extends SlaveAccount {
  telemetry?: Telemetry;
}

const STATUS_MAP: Record<Mt5Status, { label: string; color: string; icon: React.ReactNode }> = {
  CONNECTED: {
    label: "Connected",
    color: "text-green-400 bg-green-500/10 border-green-500/20",
    icon: <Wifi className="w-3.5 h-3.5" />,
  },
  SYNCING: {
    label: "Synchronizing",
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    icon: <Activity className="w-3.5 h-3.5 animate-pulse" />,
  },
  DISCONNECTED: {
    label: "Disconnected",
    color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    icon: <WifiOff className="w-3.5 h-3.5" />,
  },
  ERROR: {
    label: "Error",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
};

function StatusBadge({ status }: { status: Mt5Status }) {
  const { label, color, icon } = STATUS_MAP[status] ?? STATUS_MAP.DISCONNECTED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {icon}
      {label}
    </span>
  );
}

function ProvisioningBanner({ message }: { message: string }) {
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + 2));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Cloud className="w-6 h-6 text-yellow-400" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-ping" />
        </div>
        <div>
          <p className="text-sm font-semibold text-yellow-300">Provisioning Cloud Terminal</p>
          <p className="text-xs text-yellow-400/70 mt-0.5">
            Please wait while synchronization completes — usually 1–2 minutes.
          </p>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 bg-yellow-500/10 [&>div]:bg-yellow-400" />
      {message && (
        <p className="text-xs text-slate-400">{message}</p>
      )}
    </div>
  );
}

function TelemetryGrid({ telemetry, currency }: { telemetry: Telemetry; currency?: string | null }) {
  const fmt = (v: number | null | undefined, digits = 2) =>
    v != null ? v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";

  const cur = currency ?? telemetry.currency ?? "";

  return (
    <div className="grid grid-cols-2 gap-3 pt-1">
      <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800">
        <div className="flex items-center gap-1.5 mb-1">
          <DollarSign className="w-3 h-3 text-green-500" />
          <p className="text-xs text-slate-500 uppercase tracking-wide">Balance</p>
        </div>
        <p className="text-base font-semibold text-slate-100 tabular-nums">
          {cur} {fmt(telemetry.balance)}
        </p>
      </div>
      <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className="w-3 h-3 text-blue-400" />
          <p className="text-xs text-slate-500 uppercase tracking-wide">Equity</p>
        </div>
        <p className="text-base font-semibold text-slate-100 tabular-nums">
          {cur} {fmt(telemetry.equity)}
        </p>
      </div>
      <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800">
        <div className="flex items-center gap-1.5 mb-1">
          <Activity className="w-3 h-3 text-purple-400" />
          <p className="text-xs text-slate-500 uppercase tracking-wide">Free Margin</p>
        </div>
        <p className="text-base font-semibold text-slate-100 tabular-nums">
          {cur} {fmt(telemetry.freeMargin)}
        </p>
      </div>
      <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800">
        <div className="flex items-center gap-1.5 mb-1">
          <Shield className="w-3 h-3 text-orange-400" />
          <p className="text-xs text-slate-500 uppercase tracking-wide">Leverage</p>
        </div>
        <p className="text-base font-semibold text-slate-100">
          {telemetry.leverage != null ? `1:${telemetry.leverage}` : "—"}
        </p>
      </div>
    </div>
  );
}

function AccountCard({
  account,
  liveTelemetry,
  onDelete,
  onReconnect,
  isDeleting,
  isReconnecting,
}: {
  account: AccountWithTelemetry;
  liveTelemetry?: Telemetry;
  onDelete: (id: number) => void;
  onReconnect: (id: number) => void;
  isDeleting: boolean;
  isReconnecting: boolean;
}) {
  const telemetry = liveTelemetry ?? account.telemetry;
  const status = account.status as Mt5Status;
  const isSyncing = status === "SYNCING";
  const isConnected = status === "CONNECTED";

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-slate-50 text-lg font-mono">
              #{account.mt5Login}
            </CardTitle>
            <CardDescription className="text-slate-500 mt-0.5">
              {account.brokerServer}
            </CardDescription>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSyncing && (
          <ProvisioningBanner message={account.statusMessage ?? "Initialising cloud connection…"} />
        )}

        {status === "ERROR" && account.statusMessage && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2.5">
            <p className="text-xs text-red-400">{account.statusMessage}</p>
          </div>
        )}

        {status === "DISCONNECTED" && account.statusMessage && (
          <div className="rounded-md bg-slate-800 border border-slate-700 px-3 py-2.5">
            <p className="text-xs text-slate-400">{account.statusMessage}</p>
          </div>
        )}

        {isConnected && telemetry && (
          <TelemetryGrid telemetry={telemetry} currency={telemetry.currency} />
        )}

        {isConnected && !telemetry && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide">Last Sync</p>
              <p className="text-slate-300 mt-0.5">
                {account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : "Never"}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide">MetaApi ID</p>
              <p className="text-slate-300 mt-0.5 font-mono text-xs truncate" title={account.metaApiAccountId ?? ""}>
                {account.metaApiAccountId ? account.metaApiAccountId.slice(0, 12) + "…" : "—"}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => onReconnect(account.id)}
            disabled={isReconnecting || isSyncing}
          >
            {isReconnecting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Reconnect
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="border-red-800/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-slate-900 border-slate-700">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-slate-50">Remove MT5 Account</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400">
                  This will permanently disconnect and remove MT5 account{" "}
                  <span className="text-slate-200 font-mono">#{account.mt5Login}</span> from{" "}
                  <span className="text-slate-200">{account.brokerServer}</span>. The MetaApi cloud
                  terminal will also be deleted. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(account.id)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Remove Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectAccountDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ mt5Login: "", mt5Password: "", brokerServer: "" });
  const { toast } = useToast();
  const mutation = useConnectMt5Account();

  const handleOpenChange = (v: boolean) => {
    if (provisioning) return;
    setOpen(v);
    if (!v) setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.mt5Login || !form.mt5Password || !form.brokerServer) {
      setFormError("Please fill in all three fields before connecting.");
      return;
    }

    mutation.mutate(
      { data: { mt5Login: form.mt5Login, mt5Password: form.mt5Password, brokerServer: form.brokerServer } },
      {
        onSuccess: () => {
          setProvisioning(true);
          setTimeout(() => {
            setProvisioning(false);
            setForm({ mt5Login: "", mt5Password: "", brokerServer: "" });
            setFormError(null);
            setOpen(false);
            onSuccess();
          }, 2000);
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to connect account";
          setFormError(msg);
          toast({ title: "Connection failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Connect MT5 Account
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-50">
        <DialogHeader>
          <DialogTitle className="text-slate-50">Connect MT5 Account</DialogTitle>
        </DialogHeader>

        {provisioning ? (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative w-14 h-14 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Cloud className="w-7 h-7 text-yellow-400" />
                <span className="absolute inset-0 rounded-full border-2 border-yellow-400 animate-ping opacity-40" />
              </div>
              <div>
                <p className="font-semibold text-slate-100">Provisioning Cloud Terminal</p>
                <p className="text-sm text-slate-400 mt-1">
                  Please wait while synchronization completes.
                  <br />
                  <span className="text-xs text-slate-500">Expected: 1–2 minutes</span>
                </p>
              </div>
              <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="mt5Login" className="text-slate-300">MT5 Login (Account Number)</Label>
              <Input
                id="mt5Login"
                placeholder="e.g. 123456789"
                value={form.mt5Login}
                onChange={(e) => { setForm((f) => ({ ...f, mt5Login: e.target.value })); setFormError(null); }}
                className="bg-slate-800 border-slate-700 text-slate-50 placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt5Password" className="text-slate-300">MT5 Password</Label>
              <Input
                id="mt5Password"
                type="password"
                placeholder="Your MT5 account password"
                value={form.mt5Password}
                onChange={(e) => { setForm((f) => ({ ...f, mt5Password: e.target.value })); setFormError(null); }}
                className="bg-slate-800 border-slate-700 text-slate-50 placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brokerServer" className="text-slate-300">Broker Server</Label>
              <BrokerServerInput
                value={form.brokerServer}
                onChange={(v) => { setForm((f) => ({ ...f, brokerServer: v })); setFormError(null); }}
                error={!!formError && !form.brokerServer}
              />
              <p className="text-xs text-slate-500">
                Find this in MT5 → File → Open an Account, or pick from the list above.
              </p>
            </div>

            {/* Inline error block — persists so the user can read and act on it */}
            {formError && (
              <div className="flex gap-2.5 rounded-md bg-red-500/10 border border-red-500/25 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 leading-snug">{formError}</p>
              </div>
            )}

            <div className="rounded-md bg-slate-800 border border-slate-700 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <p className="text-xs font-medium text-slate-300">Cloud-to-Cloud Architecture</p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                No VPS or local MT5 terminal required. A MetaApi cloud terminal will be provisioned
                automatically. Your password is encrypted with AES-256-GCM.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Connect & Provision
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Mt5Accounts() {
  const queryClient = useQueryClient();
  const { data: accounts = [], isLoading } = useGetMt5Accounts({
    query: { queryKey: getGetMt5AccountsQueryKey() },
  });
  const deleteMutation = useDeleteMt5Account();
  const reconnectMutation = useReconnectMt5Account();
  const { toast } = useToast();

  // Live telemetry pushed via WebSocket, keyed by local account ID
  const [telemetryMap, setTelemetryMap] = useState<Record<number, Telemetry>>({});

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetMt5AccountsQueryKey() });
  }, [queryClient]);

  // Real-time MetaApi status pushes — update query cache + telemetry in place
  useMt5WebSocket(
    useCallback(
      (push: Mt5StatusPush) => {
        // Patch the cached accounts list without a full refetch
        queryClient.setQueryData<SlaveAccount[]>(
          getGetMt5AccountsQueryKey(),
          (prev) =>
            prev?.map((a) =>
              a.id === push.accountId
                ? {
                    ...a,
                    status: push.status as SlaveAccount["status"],
                    statusMessage: push.statusMessage,
                    lastSyncAt: push.lastSyncAt,
                    updatedAt: push.updatedAt,
                  }
                : a
            ) ?? prev
        );

        // Stash telemetry so the card can render it without a separate HTTP call
        if (push.telemetry) {
          setTelemetryMap((prev) => ({
            ...prev,
            [push.accountId]: push.telemetry as Telemetry,
          }));
        }
      },
      [queryClient]
    )
  );

  const hasSyncing = accounts.some((a) => a.status === "SYNCING");

  // Fallback poll every 15 s while syncing (WebSocket is primary; this is belt-and-suspenders)
  useEffect(() => {
    if (!hasSyncing) return;
    const interval = setInterval(invalidate, 15000);
    return () => clearInterval(interval);
  }, [hasSyncing, invalidate]);

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Account removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to remove account", variant: "destructive" }),
      }
    );
  };

  const handleReconnect = (id: number) => {
    reconnectMutation.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Reconnecting…" }); invalidate(); },
        onError: () => toast({ title: "Failed to reconnect", variant: "destructive" }),
      }
    );
  };

  const counts = {
    connected: accounts.filter((a) => a.status === "CONNECTED").length,
    syncing: accounts.filter((a) => a.status === "SYNCING").length,
    disconnected: accounts.filter((a) => a.status === "DISCONNECTED").length,
    error: accounts.filter((a) => a.status === "ERROR").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">MT5 Accounts</h2>
          <p className="text-slate-400 mt-1">Cloud-connected MetaTrader 5 accounts — no VPS required.</p>
        </div>
        <ConnectAccountDialog onSuccess={invalidate} />
      </div>

      {accounts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Connected", value: counts.connected, color: "text-green-400", icon: <Wifi className="w-4 h-4" /> },
            { label: "Synchronizing", value: counts.syncing, color: "text-yellow-400", icon: <Activity className="w-4 h-4 animate-pulse" /> },
            { label: "Disconnected", value: counts.disconnected, color: "text-slate-400", icon: <WifiOff className="w-4 h-4" /> },
            { label: "Error", value: counts.error, color: "text-red-400", icon: <AlertTriangle className="w-4 h-4" /> },
          ].map(({ label, value, color, icon }) => (
            <Card key={label} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-3 px-4">
                <div className={`flex items-center gap-2 ${color} mb-1`}>
                  {icon}
                  <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
                </div>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
              <Cloud className="w-7 h-7 text-slate-500" />
            </div>
            <div className="text-center">
              <p className="text-slate-300 font-medium">No MT5 accounts connected</p>
              <p className="text-slate-500 text-sm mt-1">
                Connect your MT5 account — a cloud terminal will be provisioned automatically.
              </p>
            </div>
            <ConnectAccountDialog onSuccess={invalidate} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account as AccountWithTelemetry}
              liveTelemetry={telemetryMap[account.id]}
              onDelete={handleDelete}
              onReconnect={handleReconnect}
              isDeleting={deleteMutation.isPending}
              isReconnecting={reconnectMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
