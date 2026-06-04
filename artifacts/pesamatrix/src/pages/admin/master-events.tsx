import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Activity, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, PenLine, Loader2, Zap,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────

type EventType = "POSITION_OPENED" | "POSITION_MODIFIED" | "POSITION_CLOSED";

type MasterTradeEvent = {
  id: number;
  metaApiAccountId: string;
  eventType: EventType;
  positionId: string;
  symbol: string;
  direction: string;
  volume: string | null;
  openPrice: string | null;
  currentPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  profit: string | null;
  comment: string | null;
  changedFields: string | null;
  jobId: string | null;
  jobStatus: string | null;
  createdAt: string;
};

type EventsResponse = {
  events: MasterTradeEvent[];
  total: number;
  limit: number;
  offset: number;
};

type StatsResponse = {
  total: number;
  today: number;
  byType: Record<string, number>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const EVENT_FILTERS: Array<{ label: string; value: EventType | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Opened", value: "POSITION_OPENED" },
  { label: "Modified", value: "POSITION_MODIFIED" },
  { label: "Closed", value: "POSITION_CLOSED" },
];

function EventTypeBadge({ type }: { type: EventType }) {
  if (type === "POSITION_OPENED")
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/25 gap-1.5 font-medium">
        <TrendingUp className="w-3 h-3" /> Opened
      </Badge>
    );
  if (type === "POSITION_CLOSED")
    return (
      <Badge className="bg-red-500/10 text-red-400 border-red-500/25 gap-1.5 font-medium">
        <TrendingDown className="w-3 h-3" /> Closed
      </Badge>
    );
  return (
    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/25 gap-1.5 font-medium">
      <PenLine className="w-3 h-3" /> Modified
    </Badge>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const upper = direction.toUpperCase();
  if (upper === "BUY")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-500/15 text-green-400">
        BUY
      </span>
    );
  if (upper === "SELL")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-400">
        SELL
      </span>
    );
  return <span className="text-xs text-slate-400">{direction}</span>;
}

function JobStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-600 text-xs">—</span>;
  const s = status.toLowerCase();
  if (s === "completed" || s === "done")
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
        {status}
      </span>
    );
  if (s === "failed" || s === "error")
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
        {status}
      </span>
    );
  if (s === "active" || s === "running")
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 animate-pulse">
        {status}
      </span>
    );
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400">
      {status}
    </span>
  );
}

function fmt(val: string | null, decimals = 5) {
  if (val == null) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? val : n.toFixed(decimals);
}

const PAGE_SIZE = 50;

// ─── Stats Bar ──────────────────────────────────────────────────────────────

function StatsBar({ stats, liveCount }: { stats: StatsResponse | undefined; liveCount: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-slate-400 mb-1">Total Events</p>
          <p className="text-2xl font-bold text-slate-50">{stats?.total ?? "—"}</p>
        </CardContent>
      </Card>
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-slate-400 mb-1">Today</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-slate-50">{stats?.today ?? "—"}</p>
            {liveCount > 0 && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 animate-pulse">
                +{liveCount} live
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-slate-400 mb-1">Opened / Closed</p>
          <p className="text-2xl font-bold text-slate-50">
            <span className="text-green-400">{stats?.byType["POSITION_OPENED"] ?? 0}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-red-400">{stats?.byType["POSITION_CLOSED"] ?? 0}</span>
          </p>
        </CardContent>
      </Card>
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-slate-400 mb-1">Modified</p>
          <p className="text-2xl font-bold text-yellow-400">
            {stats?.byType["POSITION_MODIFIED"] ?? 0}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminMasterEvents() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<EventType | "ALL">("ALL");
  const [page, setPage] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [lastLiveEvent, setLastLiveEvent] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const offset = page * PAGE_SIZE;

  const eventsKey = ["admin-master-trade-events", filter, page];
  const statsKey = ["admin-master-trade-events-stats"];

  const {
    data: eventsData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<EventsResponse>({
    queryKey: eventsKey,
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (filter !== "ALL") params.set("eventType", filter);
      return customFetch<EventsResponse>(`/api/admin/master/trade-events?${params}`);
    },
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: statsKey,
    queryFn: () => customFetch<StatsResponse>("/api/admin/master/trade-events/stats"),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // WebSocket for live push
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; eventType?: string; symbol?: string };
        if (msg.type === "master_trade_event") {
          setLiveCount((n) => n + 1);
          setLastLiveEvent(msg.symbol ? `${msg.eventType} — ${msg.symbol}` : null);
          queryClient.invalidateQueries({ queryKey: eventsKey });
          queryClient.invalidateQueries({ queryKey: statsKey });
        }
      } catch {}
    };

    return () => ws.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: eventsKey });
    queryClient.invalidateQueries({ queryKey: statsKey });
    setLiveCount(0);
    setLastLiveEvent(null);
    refetch();
  };

  const totalPages = eventsData ? Math.ceil(eventsData.total / PAGE_SIZE) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-50 flex items-center gap-3">
            <Activity className="w-7 h-7 text-blue-400" />
            Master Events
          </h2>
          <p className="text-slate-400 mt-1">
            Live trade event log — every detected and executed action in real time.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 animate-pulse">
              <Zap className="w-3 h-3" />
              +{liveCount} live
            </span>
          )}
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
      </div>

      {/* Last live event toast-style indicator */}
      {lastLiveEvent && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm w-fit">
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span>New event: <span className="font-semibold">{lastLiveEvent}</span></span>
        </div>
      )}

      {/* Stats */}
      <StatsBar stats={stats} liveCount={liveCount} />

      {/* Filter + Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-slate-50 text-base">Event Log</CardTitle>
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950/60 border border-slate-800">
              {EVENT_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setFilter(f.value); setPage(0); }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                    filter === f.value
                      ? "bg-slate-700 text-slate-100 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {f.label}
                  {f.value !== "ALL" && stats?.byType[f.value] != null && (
                    <span className="ml-1.5 text-slate-500">
                      {stats.byType[f.value]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading events…</span>
            </div>
          ) : !eventsData || eventsData.events.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="font-medium">No events recorded yet.</p>
              <p className="text-sm mt-1">Events appear here as soon as the master account generates trades.</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border border-slate-800 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-950/50">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400 w-[140px]">Event</TableHead>
                      <TableHead className="text-slate-400">Symbol</TableHead>
                      <TableHead className="text-slate-400">Direction</TableHead>
                      <TableHead className="text-slate-400 text-right">Volume</TableHead>
                      <TableHead className="text-slate-400 text-right">Open</TableHead>
                      <TableHead className="text-slate-400 text-right">SL</TableHead>
                      <TableHead className="text-slate-400 text-right">TP</TableHead>
                      <TableHead className="text-slate-400 text-right">Profit</TableHead>
                      <TableHead className="text-slate-400">Job Status</TableHead>
                      <TableHead className="text-slate-400 text-right">Detected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsData.events.map((ev) => (
                      <TableRow
                        key={ev.id}
                        className="border-slate-800 hover:bg-slate-800/40 transition-colors"
                      >
                        <TableCell>
                          <EventTypeBadge type={ev.eventType} />
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-slate-200 tracking-wide">
                          {ev.symbol}
                        </TableCell>
                        <TableCell>
                          <DirectionBadge direction={ev.direction} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-300 text-sm">
                          {ev.volume ? parseFloat(ev.volume).toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-400 text-sm">
                          {fmt(ev.openPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-400/80 text-sm">
                          {fmt(ev.stopLoss)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-400/80 text-sm">
                          {fmt(ev.takeProfit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {ev.profit ? (
                            <span className={parseFloat(ev.profit) >= 0 ? "text-green-400" : "text-red-400"}>
                              {parseFloat(ev.profit) >= 0 ? "+" : ""}
                              {parseFloat(ev.profit).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <JobStatusBadge status={ev.jobStatus} />
                            {ev.jobId && (
                              <p className="text-xs text-slate-600 font-mono truncate max-w-[100px]" title={ev.jobId}>
                                {ev.jobId.slice(0, 8)}…
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-xs text-slate-400">
                            {format(new Date(ev.createdAt), "MMM dd, HH:mm:ss")}
                          </div>
                          <div className="text-xs text-slate-600">
                            {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-slate-500">
                  Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, eventsData.total)} of {eventsData.total} events
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </Button>
                  <span className="text-sm text-slate-500 px-1">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
