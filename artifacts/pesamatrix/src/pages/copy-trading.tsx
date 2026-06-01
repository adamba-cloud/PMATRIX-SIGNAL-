import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMt5Accounts } from "@workspace/api-client-react";
import {
  useGetCopyTradeLinks,
  useCreateCopyTradeLink,
  useUpdateCopyTradeLink,
  useDeleteCopyTradeLink,
  useGetCopyTradeLogs,
  getGetCopyTradeLinksQueryKey,
  getGetCopyTradeLogsQueryKey,
  type CopyTradeLink,
  type CopyTradeLog,
  type CopyTradeStatus,
  type LotSizeType,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Loader2,
  GitFork,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CopyTradeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "Pending",
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    icon: <Clock className="w-3 h-3" />,
  },
  SUCCESS: {
    label: "Success",
    color: "text-green-400 bg-green-500/10 border-green-500/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  FAILED: {
    label: "Failed",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    icon: <XCircle className="w-3 h-3" />,
  },
  SKIPPED: {
    label: "Skipped",
    color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    icon: <SkipForward className="w-3 h-3" />,
  },
};

function StatusBadge({ status }: { status: CopyTradeStatus }) {
  const { label, color, icon } = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {icon}
      {label}
    </span>
  );
}

// ─── Add Link Dialog ──────────────────────────────────────────────────────────

function AddLinkDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [masterAccountId, setMasterAccountId] = useState("");
  const [slaveAccountId, setSlaveAccountId] = useState("");
  const [lotSizeType, setLotSizeType] = useState<LotSizeType>("FIXED");
  const [volumeMultiplier, setVolumeMultiplier] = useState("1");
  const { toast } = useToast();
  const { data: accounts = [] } = useGetMt5Accounts();
  const mutation = useCreateCopyTradeLink();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterAccountId || !slaveAccountId) {
      toast({ title: "Select both accounts", variant: "destructive" });
      return;
    }
    if (masterAccountId === slaveAccountId) {
      toast({ title: "Master and slave must be different accounts", variant: "destructive" });
      return;
    }
    mutation.mutate(
      {
        data: {
          masterAccountId: parseInt(masterAccountId, 10),
          slaveAccountId: parseInt(slaveAccountId, 10),
          lotSizeType,
          volumeMultiplier: parseFloat(volumeMultiplier) || 1,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Copy link created" });
          setOpen(false);
          setMasterAccountId("");
          setSlaveAccountId("");
          setLotSizeType("FIXED");
          setVolumeMultiplier("1");
          onSuccess();
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to create link";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add Copy Link
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-50">
        <DialogHeader>
          <DialogTitle className="text-slate-50">New Copy Trading Link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="text-slate-300">Master Account (signal source)</Label>
            <Select value={masterAccountId} onValueChange={setMasterAccountId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-50">
                <SelectValue placeholder="Select master account…" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)} className="text-slate-200">
                    #{a.mt5Login} — {a.brokerServer}
                    <span className={`ml-2 text-xs ${a.status === "CONNECTED" ? "text-green-400" : "text-slate-500"}`}>
                      ({a.status})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Slave Account (copy target)</Label>
            <Select value={slaveAccountId} onValueChange={setSlaveAccountId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-50">
                <SelectValue placeholder="Select slave account…" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {accounts
                  .filter((a) => String(a.id) !== masterAccountId)
                  .map((a) => (
                    <SelectItem key={a.id} value={String(a.id)} className="text-slate-200">
                      #{a.mt5Login} — {a.brokerServer}
                      <span className={`ml-2 text-xs ${a.status === "CONNECTED" ? "text-green-400" : "text-slate-500"}`}>
                        ({a.status})
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lot Size Mode */}
          <div className="space-y-2">
            <Label className="text-slate-300">Lot Size Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLotSizeType("FIXED")}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  lotSizeType === "FIXED"
                    ? "border-green-500 bg-green-500/10 text-green-400"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="font-semibold">Fixed Lots</p>
                <p className="text-xs opacity-70 mt-0.5">Use volume multiplier</p>
              </button>
              <button
                type="button"
                onClick={() => setLotSizeType("PROPORTIONAL")}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  lotSizeType === "PROPORTIONAL"
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="font-semibold">Proportional</p>
                <p className="text-xs opacity-70 mt-0.5">Scale by account balance</p>
              </button>
            </div>
          </div>

          {/* Conditional fields */}
          {lotSizeType === "FIXED" ? (
            <div className="space-y-2">
              <Label className="text-slate-300">Volume Multiplier</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={volumeMultiplier}
                onChange={(e) => setVolumeMultiplier(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-50"
              />
              <p className="text-xs text-slate-500">
                1.0 = exact copy · 0.5 = half volume · 2.0 = double volume
              </p>
            </div>
          ) : (
            <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-blue-400">Proportional Risk Mode</p>
              <p className="text-xs text-slate-400">
                Lot size = Master Lots × (Slave Balance ÷ Master Balance)
              </p>
              <p className="text-xs text-slate-500">
                Example: Master $10,000 trades 1.00 lot → Slave $1,000 gets 0.10 lot.
                Minimum enforced: 0.01 lot.
              </p>
            </div>
          )}

          <div className="rounded-md bg-slate-800 border border-slate-700 p-3 space-y-1">
            <p className="text-xs font-medium text-slate-300">Exact SL &amp; TP mapping</p>
            <p className="text-xs text-slate-500">
              Stop Loss and Take Profit are copied exactly from the master trade — no offset.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
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
              Create Link
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link Card ────────────────────────────────────────────────────────────────

function LinkCard({
  link,
  accounts,
  onToggle,
  onDelete,
  isToggling,
  isDeleting,
}: {
  link: CopyTradeLink;
  accounts: Array<{ id: number; mt5Login: string; brokerServer: string; status: string }>;
  onToggle: (id: number, isActive: boolean) => void;
  onDelete: (id: number) => void;
  isToggling: boolean;
  isDeleting: boolean;
}) {
  const master = accounts.find((a) => a.id === link.masterAccountId);
  const slave = accounts.find((a) => a.id === link.slaveAccountId);

  return (
    <Card className={`bg-slate-900 border-slate-800 transition-opacity ${link.isActive ? "" : "opacity-60"}`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Master */}
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Master</p>
                <p className="text-sm font-mono font-semibold text-slate-100">
                  #{master?.mt5Login ?? link.masterAccountId}
                </p>
                <p className="text-xs text-slate-500 truncate max-w-[120px]">
                  {master?.brokerServer ?? ""}
                </p>
              </div>

              <GitFork className="w-4 h-4 text-green-500 flex-shrink-0 rotate-90" />

              {/* Slave */}
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Slave</p>
                <p className="text-sm font-mono font-semibold text-slate-100">
                  #{slave?.mt5Login ?? link.slaveAccountId}
                </p>
                <p className="text-xs text-slate-500 truncate max-w-[120px]">
                  {slave?.brokerServer ?? ""}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-slate-500">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${
                link.lotSizeType === "PROPORTIONAL"
                  ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                  : "text-slate-300 bg-slate-700/50 border-slate-700"
              }`}>
                {link.lotSizeType === "PROPORTIONAL" ? "Proportional" : "Fixed"}
              </span>
              {link.lotSizeType === "FIXED" && (
                <span>×<span className="text-slate-300 font-mono">{link.volumeMultiplier}</span></span>
              )}
              <span>·</span>
              <span className={link.isActive ? "text-green-400" : "text-slate-500"}>
                {link.isActive ? "Active" : "Paused"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100"
              onClick={() => onToggle(link.id, !link.isActive)}
              disabled={isToggling}
              title={link.isActive ? "Pause" : "Resume"}
            >
              {isToggling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : link.isActive ? (
                <ToggleRight className="w-5 h-5 text-green-400" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-900 border-slate-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-slate-50">Remove Copy Link</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    This will permanently remove the copy link. Open trades on the slave account
                    will not be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(link.id)}
                    disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Audit Log Table ──────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function AuditLogTable({
  accounts,
}: {
  accounts: Array<{ id: number; mt5Login: string }>;
}) {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useGetCopyTradeLogs(
    { limit: PAGE_SIZE, offset },
    { query: { queryKey: getGetCopyTradeLogsQueryKey({ limit: PAGE_SIZE, offset }), refetchInterval: 10000 } }
  );

  const logs = data?.logs ?? [];
  const loginFor = (id: number) => accounts.find((a) => a.id === id)?.mt5Login ?? String(id);

  const statusCounts = logs.reduce(
    (acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      {logs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["SUCCESS", "FAILED", "PENDING", "SKIPPED"] as CopyTradeStatus[]).map((s) => (
            statusCounts[s] ? (
              <span key={s} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_CONFIG[s].color}`}>
                {STATUS_CONFIG[s].icon}
                {statusCounts[s]} {STATUS_CONFIG[s].label}
              </span>
            ) : null
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          No execution history yet. Copy trades will appear here when master accounts open positions.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  {["Time", "Master", "Slave", "Symbol", "Dir", "Master Lots", "Exec Lots", "Master Bal", "Slave Bal", "SL", "TP", "Status", "Result"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRow key={log.id} log={log} loginFor={loginFor} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {offset + 1}–{offset + logs.length}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 h-7 px-2"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 h-7 px-2"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={logs.length < PAGE_SIZE}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LogRow({ log, loginFor }: { log: CopyTradeLog; loginFor: (id: number) => string }) {
  const fmt = (v: string | null) => (v ? parseFloat(v).toFixed(5) : "—");
  const fmtVol = (v: string | null) => (v ? parseFloat(v).toFixed(2) : "—");
  const fmtBal = (v: string | null) => (v ? `$${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—");
  const time = new Date(log.createdAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-900/40 transition-colors">
      <td className="px-3 py-2 text-slate-400 whitespace-nowrap text-xs">{time}</td>
      <td className="px-3 py-2 font-mono text-slate-300">#{loginFor(log.masterAccountId)}</td>
      <td className="px-3 py-2 font-mono text-slate-300">#{loginFor(log.slaveAccountId)}</td>
      <td className="px-3 py-2 font-semibold text-slate-100">{log.symbol}</td>
      <td className="px-3 py-2">
        <span className={`text-xs font-bold ${log.direction === "BUY" ? "text-green-400" : "text-red-400"}`}>
          {log.direction}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-slate-400 text-xs">{fmtVol(log.masterLots)}</td>
      <td className="px-3 py-2 font-mono text-slate-100 text-xs font-semibold">{fmtVol(log.calculatedLots ?? log.volume)}</td>
      <td className="px-3 py-2 font-mono text-slate-400 text-xs">{fmtBal(log.masterBalance)}</td>
      <td className="px-3 py-2 font-mono text-slate-400 text-xs">{fmtBal(log.slaveBalance)}</td>
      <td className="px-3 py-2 font-mono text-slate-400 text-xs">{fmt(log.stopLoss)}</td>
      <td className="px-3 py-2 font-mono text-slate-400 text-xs">{fmt(log.takeProfit)}</td>
      <td className="px-3 py-2">
        <StatusBadge status={log.status} />
      </td>
      <td className="px-3 py-2 max-w-[200px]">
        {log.errorMessage ? (
          <span className="text-xs text-red-400 truncate block" title={log.errorMessage}>
            {log.errorMessage}
          </span>
        ) : log.slaveTicket ? (
          <span className="text-xs text-slate-500 font-mono">#{log.slaveTicket}</span>
        ) : null}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CopyTrading() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: accounts = [] } = useGetMt5Accounts();
  const { data: links = [], isLoading: linksLoading } = useGetCopyTradeLinks({
    query: { queryKey: getGetCopyTradeLinksQueryKey(), refetchInterval: 30000 },
  });

  const updateMutation = useUpdateCopyTradeLink();
  const deleteMutation = useDeleteCopyTradeLink();

  const invalidateLinks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetCopyTradeLinksQueryKey() });
  }, [queryClient]);

  const handleToggle = (id: number, isActive: boolean) => {
    updateMutation.mutate(
      { id, data: { isActive } },
      {
        onSuccess: () => {
          toast({ title: isActive ? "Link resumed" : "Link paused" });
          invalidateLinks();
        },
        onError: () => toast({ title: "Failed to update link", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Link removed" }); invalidateLinks(); },
        onError: () => toast({ title: "Failed to remove link", variant: "destructive" }),
      }
    );
  };

  const activeLinks = links.filter((l) => l.isActive);
  const pausedLinks = links.filter((l) => !l.isActive);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Copy Trading</h2>
          <p className="text-slate-400 mt-1">
            Mirror master account trades to slave accounts in real time — exact SL &amp; TP mapping.
          </p>
        </div>
        {accounts.length >= 2 && <AddLinkDialog onSuccess={invalidateLinks} />}
      </div>

      {/* Stats */}
      {links.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Links", value: links.length, color: "text-slate-300" },
            { label: "Active", value: activeLinks.length, color: "text-green-400" },
            { label: "Paused", value: pausedLinks.length, color: "text-slate-500" },
          ].map(({ label, value, color }) => (
            <Card key={label} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Links */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-100 text-lg">Copy Links</CardTitle>
          <CardDescription className="text-slate-500">
            Each link copies all new trades from the master account to its slave — queue-based, concurrent processing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linksLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
            </div>
          ) : accounts.length < 2 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              You need at least two connected MT5 accounts to set up copy trading.
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                <GitFork className="w-6 h-6 text-slate-500" />
              </div>
              <div className="text-center">
                <p className="text-slate-300 font-medium">No copy links yet</p>
                <p className="text-slate-500 text-sm mt-1">
                  Add a link to start mirroring trades from a master to slave accounts.
                </p>
              </div>
              <AddLinkDialog onSuccess={invalidateLinks} />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {links.map((link) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  accounts={accounts as Array<{ id: number; mt5Login: string; brokerServer: string; status: string }>}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  isToggling={updateMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-100 text-lg">Execution History</CardTitle>
          <CardDescription className="text-slate-500">
            Full audit log of every copy trade — including failures and retries.
            One failure never stops remaining accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogTable accounts={accounts as Array<{ id: number; mt5Login: string }>} />
        </CardContent>
      </Card>
    </div>
  );
}
