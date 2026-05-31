import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetJournalStats,
  useGetJournalTrades,
  useCreateJournalTrade,
  useUpdateJournalTrade,
  useDeleteJournalTrade,
  getJournalStatsQueryKey,
  getJournalQueryKey,
  type TradeEntry,
  type TradeDirection,
  type TradeOutcome,
  type CreateTradeInput,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  BookOpen,
  Plus,
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  BarChart2,
  Pencil,
  Trash2,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMON_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSDT", "GBPJPY", "US30", "NAS100", "USDCHF", "AUDUSD"];

const TODAY = new Date().toISOString().split("T")[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPnl(val: string | number) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  const abs = Math.abs(n).toFixed(2);
  return (n >= 0 ? "+" : "-") + "$" + abs;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const outcomeConfig: Record<TradeOutcome, { label: string; color: string; badge: string }> = {
  WIN:        { label: "Win",       color: "text-green-400",  badge: "bg-green-500/15 text-green-400 border-green-500/30" },
  LOSS:       { label: "Loss",      color: "text-red-400",    badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  BREAK_EVEN: { label: "B/E",       color: "text-slate-400",  badge: "bg-slate-700/50 text-slate-400 border-slate-600/40" },
};

const dirConfig: Record<TradeDirection, { label: string; icon: React.ReactNode; color: string }> = {
  BUY:  { label: "BUY",  icon: <ArrowUpRight className="w-3 h-3" />,   color: "text-green-400" },
  SELL: { label: "SELL", icon: <ArrowDownRight className="w-3 h-3" />, color: "text-red-400"   },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon, positive }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; positive?: boolean;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</CardTitle>
        <span className="text-green-500">{icon}</span>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={`text-2xl font-bold font-mono ${positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-white"}`}>
          {value}
        </div>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Trade Form ───────────────────────────────────────────────────────────────

interface TradeFormState {
  pair: string;
  direction: TradeDirection;
  entryPrice: string;
  exitPrice: string;
  lotSize: string;
  outcome: TradeOutcome;
  pnl: string;
  pips: string;
  notes: string;
  tradeDate: string;
}

const defaultForm = (): TradeFormState => ({
  pair: "", direction: "BUY", entryPrice: "", exitPrice: "",
  lotSize: "0.01", outcome: "WIN", pnl: "", pips: "", notes: "", tradeDate: TODAY,
});

function tradeToForm(t: TradeEntry): TradeFormState {
  return {
    pair: t.pair, direction: t.direction, entryPrice: t.entryPrice, exitPrice: t.exitPrice,
    lotSize: t.lotSize, outcome: t.outcome, pnl: t.pnl,
    pips: t.pips ?? "", notes: t.notes ?? "",
    tradeDate: t.tradeDate.split("T")[0],
  };
}

function TradeFormDialog({
  open, onOpenChange, initial, onSubmit, isPending, title,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial?: TradeFormState; onSubmit: (f: TradeFormState) => void;
  isPending: boolean; title: string;
}) {
  const [form, setForm] = useState<TradeFormState>(initial ?? defaultForm());

  // Sync with initial when it changes (edit mode)
  useMemo(() => { if (initial) setForm(initial); }, [initial]);

  const set = (k: keyof TradeFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.pair || !form.entryPrice || !form.exitPrice || !form.pnl || !form.tradeDate) return;
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Pair */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Currency Pair</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_PAIRS.map((p) => (
                <button key={p} type="button" onClick={() => set("pair", p)}
                  className={`px-2 py-0.5 text-xs rounded font-mono border transition-all ${
                    form.pair === p
                      ? "bg-green-500/20 border-green-500 text-green-400"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
            <Input value={form.pair} onChange={(e) => set("pair", e.target.value.toUpperCase())}
              className="bg-slate-950 border-slate-700 text-white font-mono focus:border-green-500 focus:ring-green-500/20"
              placeholder="e.g. EURUSD" required />
          </div>

          {/* Direction */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Direction</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["BUY", "SELL"] as TradeDirection[]).map((d) => (
                <button key={d} type="button" onClick={() => set("direction", d)}
                  className={`py-2.5 text-sm font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                    form.direction === d
                      ? d === "BUY"
                        ? "bg-green-500/20 border-green-500 text-green-400"
                        : "bg-red-500/20 border-red-500 text-red-400"
                      : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  {d === "BUY" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Prices + Lot */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Entry Price</Label>
              <Input value={form.entryPrice} onChange={(e) => set("entryPrice", e.target.value)}
                type="number" step="any" className="bg-slate-950 border-slate-700 text-white font-mono text-sm focus:border-green-500 focus:ring-green-500/20"
                placeholder="1.08500" required />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Exit Price</Label>
              <Input value={form.exitPrice} onChange={(e) => set("exitPrice", e.target.value)}
                type="number" step="any" className="bg-slate-950 border-slate-700 text-white font-mono text-sm focus:border-green-500 focus:ring-green-500/20"
                placeholder="1.09000" required />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Lot Size</Label>
              <Input value={form.lotSize} onChange={(e) => set("lotSize", e.target.value)}
                type="number" step="any" min="0.01" className="bg-slate-950 border-slate-700 text-white font-mono text-sm focus:border-green-500 focus:ring-green-500/20"
                placeholder="0.01" />
            </div>
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Outcome</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["WIN", "LOSS", "BREAK_EVEN"] as TradeOutcome[]).map((o) => (
                <button key={o} type="button" onClick={() => set("outcome", o)}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                    form.outcome === o
                      ? outcomeConfig[o].badge + " border-current"
                      : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  {outcomeConfig[o].label}
                </button>
              ))}
            </div>
          </div>

          {/* P&L + Pips */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm">P&L (USD) <span className="text-slate-500 text-xs">use – for loss</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <Input value={form.pnl} onChange={(e) => set("pnl", e.target.value)}
                  type="number" step="any" className="bg-slate-950 border-slate-700 text-white font-mono pl-7 focus:border-green-500 focus:ring-green-500/20"
                  placeholder="120.00" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm">Pips <span className="text-slate-500 text-xs">(optional)</span></Label>
              <Input value={form.pips} onChange={(e) => set("pips", e.target.value)}
                type="number" step="any" className="bg-slate-950 border-slate-700 text-white font-mono focus:border-green-500 focus:ring-green-500/20"
                placeholder="50" />
            </div>
          </div>

          {/* Trade Date */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Trade Date</Label>
            <Input value={form.tradeDate} onChange={(e) => set("tradeDate", e.target.value)}
              type="date" className="bg-slate-950 border-slate-700 text-white focus:border-green-500 focus:ring-green-500/20"
              required />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Notes <span className="text-slate-500 text-xs">(optional)</span></Label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-md px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500/20 resize-none"
              rows={2} placeholder="Setup, reason for entry, what you learned…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:text-white">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}
              className="bg-green-600 hover:bg-green-500 text-white border-0">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Trade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Custom Chart Tooltip ─────────────────────────────────────────────────────

const PnlTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`font-bold font-mono text-sm ${val >= 0 ? "text-green-400" : "text-red-400"}`}>
        {val >= 0 ? "+" : ""}${Math.abs(val).toFixed(2)}
      </p>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

type FilterTab = "ALL" | TradeDirection | TradeOutcome;

export default function TradeJournal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [pairFilter, setPairFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<TradeEntry | null>(null);
  const [deleteTrade, setDeleteTrade] = useState<TradeEntry | null>(null);

  const { data: stats, isLoading: statsLoading } = useGetJournalStats();
  const { data: list, isLoading: listLoading } = useGetJournalTrades();

  const createMutation = useCreateJournalTrade();
  const updateMutation = useUpdateJournalTrade();
  const deleteMutation = useDeleteJournalTrade();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getJournalStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getJournalQueryKey() });
  };

  const handleCreate = (form: TradeFormState) => {
    const payload: CreateTradeInput = {
      ...form,
      pips: form.pips || undefined,
      notes: form.notes || undefined,
    };
    createMutation.mutate({ data: payload }, {
      onSuccess: () => {
        setAddOpen(false);
        invalidate();
        toast({ title: "Trade logged", description: `${form.pair} ${form.direction} saved.` });
      },
      onError: () => toast({ title: "Error", description: "Could not save trade.", variant: "destructive" }),
    });
  };

  const handleUpdate = (form: TradeFormState) => {
    if (!editTrade) return;
    updateMutation.mutate({ id: editTrade.id, data: { ...form, pips: form.pips || undefined, notes: form.notes || undefined } }, {
      onSuccess: () => {
        setEditTrade(null);
        invalidate();
        toast({ title: "Trade updated" });
      },
      onError: () => toast({ title: "Error", description: "Could not update trade.", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteTrade) return;
    deleteMutation.mutate({ id: deleteTrade.id }, {
      onSuccess: () => {
        setDeleteTrade(null);
        invalidate();
        toast({ title: "Trade deleted" });
      },
      onError: () => toast({ title: "Error", description: "Could not delete trade.", variant: "destructive" }),
    });
  };

  const filteredTrades = useMemo(() => {
    if (!list?.trades) return [];
    return list.trades.filter((t) => {
      if (filter === "BUY" && t.direction !== "BUY") return false;
      if (filter === "SELL" && t.direction !== "SELL") return false;
      if (filter === "WIN" && t.outcome !== "WIN") return false;
      if (filter === "LOSS" && t.outcome !== "LOSS") return false;
      if (filter === "BREAK_EVEN" && t.outcome !== "BREAK_EVEN") return false;
      if (pairFilter && !t.pair.includes(pairFilter.toUpperCase())) return false;
      return true;
    });
  }, [list?.trades, filter, pairFilter]);

  const isEmpty = !statsLoading && (stats?.total ?? 0) === 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-green-500" />
            Trade Journal
          </h2>
          <p className="text-slate-400 mt-1">Track every trade and analyse your performance.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-green-600 hover:bg-green-500 text-white border-0 gap-2">
          <Plus className="w-4 h-4" /> Log Trade
        </Button>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="bg-slate-900 border-slate-800 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard title="Total Trades" value={String(stats?.total ?? 0)} sub={`${stats?.wins ?? 0}W · ${stats?.losses ?? 0}L · ${stats?.breakEvens ?? 0}BE`} icon={<BarChart2 className="w-4 h-4" />} />
          <StatCard title="Win Rate" value={`${stats?.winRate ?? 0}%`} sub={`${stats?.wins ?? 0} wins from ${stats?.total ?? 0}`} icon={<Target className="w-4 h-4" />} positive={(stats?.winRate ?? 0) >= 50} />
          <StatCard title="Total P&L" value={`${(stats?.totalPnl ?? 0) >= 0 ? "+" : ""}$${Math.abs(stats?.totalPnl ?? 0).toFixed(2)}`} sub="Net profit / loss" icon={<TrendingUp className="w-4 h-4" />} positive={(stats?.totalPnl ?? 0) >= 0} />
          <StatCard title="Best Streak" value={`${stats?.bestWinStreak ?? 0} wins`} sub="Consecutive wins" icon={<Trophy className="w-4 h-4" />} />
          <StatCard title="Avg P&L" value={`${(stats?.avgPnl ?? 0) >= 0 ? "+" : ""}$${Math.abs(stats?.avgPnl ?? 0).toFixed(2)}`} sub="Per trade" icon={<BarChart2 className="w-4 h-4" />} positive={(stats?.avgPnl ?? 0) >= 0} />
        </div>
      )}

      {isEmpty ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-14 h-14 text-slate-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No trades yet</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-xs">Start logging your trades to track performance, spot patterns, and improve your strategy.</p>
            <Button onClick={() => setAddOpen(true)} className="bg-green-600 hover:bg-green-500 text-white border-0 gap-2">
              <Plus className="w-4 h-4" /> Log Your First Trade
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* P&L Chart */}
            <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  Daily P&L
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.dailyPnl ?? []} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => "$" + v} width={52} />
                      <Tooltip content={<PnlTooltip />} />
                      <ReferenceLine y={0} stroke="#334155" />
                      <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                        {(stats?.dailyPnl ?? []).map((entry, i) => (
                          <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Pairs */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">Top Pairs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(stats?.topPairs ?? []).length === 0 ? (
                  <p className="text-slate-500 text-sm">No data yet</p>
                ) : (
                  (stats?.topPairs ?? []).map((p) => {
                    const wr = p.trades > 0 ? Math.round((p.wins / p.trades) * 100) : 0;
                    const pnlPos = p.pnl >= 0;
                    return (
                      <div key={p.pair} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
                        <div>
                          <p className="text-sm font-mono font-semibold text-white">{p.pair}</p>
                          <p className="text-xs text-slate-500">{p.trades} trades · {wr}% WR</p>
                        </div>
                        <span className={`text-sm font-mono font-semibold ${pnlPos ? "text-green-400" : "text-red-400"}`}>
                          {pnlPos ? "+" : ""}${Math.abs(p.pnl).toFixed(2)}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trade Table */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <CardTitle className="text-base text-white">Trade History</CardTitle>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  {/* Filter tabs */}
                  <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1">
                    {(["ALL", "BUY", "SELL", "WIN", "LOSS"] as FilterTab[]).map((f) => (
                      <button key={f} onClick={() => setFilter(f)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                          filter === f ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"
                        }`}>
                        {f === "ALL" ? "All" : f}
                      </button>
                    ))}
                  </div>
                  {/* Pair search */}
                  <Input value={pairFilter} onChange={(e) => setPairFilter(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white w-28 h-8 text-xs font-mono focus:border-green-500 focus:ring-green-500/20"
                    placeholder="Filter pair…" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {listLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
                </div>
              ) : filteredTrades.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-12">No trades match this filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        {["Date", "Pair", "Dir", "Entry", "Exit", "Lots", "Pips", "P&L", "Outcome", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map((t) => {
                        const pnlN = parseFloat(t.pnl);
                        const dir = dirConfig[t.direction];
                        const out = outcomeConfig[t.outcome];
                        return (
                          <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group">
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtDate(t.tradeDate)}</td>
                            <td className="px-4 py-3 font-mono font-semibold text-white whitespace-nowrap">{t.pair}</td>
                            <td className={`px-4 py-3 font-bold text-xs flex items-center gap-0.5 whitespace-nowrap ${dir.color}`}>
                              {dir.icon}{dir.label}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{t.entryPrice}</td>
                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{t.exitPrice}</td>
                            <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">{t.lotSize}</td>
                            <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">{t.pips ?? "–"}</td>
                            <td className={`px-4 py-3 font-mono font-semibold whitespace-nowrap ${pnlN >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {fmtPnl(t.pnl)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${out.badge}`}>
                                {out.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditTrade(t)}
                                  className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setDeleteTrade(t)}
                                  className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Add Dialog */}
      <TradeFormDialog
        open={addOpen} onOpenChange={setAddOpen}
        onSubmit={handleCreate} isPending={createMutation.isPending}
        title="Log New Trade"
      />

      {/* Edit Dialog */}
      <TradeFormDialog
        open={!!editTrade} onOpenChange={(v) => { if (!v) setEditTrade(null); }}
        initial={editTrade ? tradeToForm(editTrade) : undefined}
        onSubmit={handleUpdate} isPending={updateMutation.isPending}
        title="Edit Trade"
      />

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTrade} onOpenChange={(v) => { if (!v) setDeleteTrade(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {deleteTrade && `${deleteTrade.pair} ${deleteTrade.direction} on ${fmtDate(deleteTrade.tradeDate)} — `}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-500 text-white border-0">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
