import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Activity, RefreshCw, Loader2, CheckCircle2, XCircle,
  Clock, AlertTriangle, Zap, ServerCrash, ListTodo, Play,
  CheckCheck, Ban, Timer, ShieldAlert, ShieldCheck, User,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type RedisInfo = {
  status: "ok" | "error" | "not_configured";
  latencyMs: number | null;
  url: string;
};

type KillSwitchStatus = {
  active: boolean;
  activatedAt: string | null;
  ttlSeconds: number | null;
  activatedBy: string | null;
};

type QueueStats = {
  name: string;
  label: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

type FailedJob = {
  queue: string;
  jobId: string | undefined;
  name: string;
  failedReason: string;
  attemptsMade: number;
  finishedOn: number | null;
};

type QueueMonitorData = {
  checkedAt: string;
  redis: RedisInfo;
  killSwitch: KillSwitchStatus;
  queues: QueueStats[];
  recentFailed: FailedJob[];
};

// ─── Throughput tracker ───────────────────────────────────────────────────────

const MAX_SAMPLES = 60;
type Sample = { ts: number; completed: Record<string, number> };

// ─── Kill switch panel ────────────────────────────────────────────────────────

function KillSwitchPanel({
  killSwitch,
  onToggle,
  isToggling,
}: {
  killSwitch: KillSwitchStatus;
  onToggle: (active: boolean, reason?: string) => void;
  isToggling: boolean;
}) {
  const [reason, setReason] = useState("");
  const active = killSwitch.active;

  // Reset reason when dialog closes
  const handleActivate = () => {
    onToggle(true, reason || undefined);
    setReason("");
  };

  const handleDeactivate = () => {
    onToggle(false);
  };

  return (
    <Card className={`border-2 transition-colors ${active ? "border-red-500/50 bg-red-500/5" : "border-slate-700 bg-slate-900"}`}>
      <CardContent className="pt-5 pb-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Status side */}
          <div className="flex items-start gap-4">
            <div className={`rounded-xl p-3 shrink-0 ${active ? "bg-red-500/15 text-red-400" : "bg-green-500/10 text-green-400"}`}>
              {active ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-base font-semibold text-slate-100">Copy Trade Kill Switch</h3>
                {active ? (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse">
                    ⏸ PAUSED
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                    ▶ RUNNING
                  </span>
                )}
              </div>
              {active ? (
                <div className="space-y-0.5">
                  <p className="text-sm text-red-300/80">
                    All copy trades are paused. New jobs are delayed until the switch is released.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {killSwitch.activatedBy && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="w-3 h-3" />
                        {killSwitch.activatedBy}
                      </span>
                    )}
                    {killSwitch.activatedAt && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(killSwitch.activatedAt), { addSuffix: true })}
                      </span>
                    )}
                    {killSwitch.ttlSeconds !== null && (
                      <span className="flex items-center gap-1 text-xs text-yellow-500/80">
                        <Timer className="w-3 h-3" />
                        Auto-resumes in {Math.floor(killSwitch.ttlSeconds / 60)}m {killSwitch.ttlSeconds % 60}s
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Copy trade queue is running normally. Use this to instantly halt all trade execution.
                </p>
              )}
            </div>
          </div>

          {/* Action button side */}
          <div className="shrink-0 self-center">
            {active ? (
              // Resume — no confirmation needed
              <Button
                onClick={handleDeactivate}
                disabled={isToggling}
                className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 gap-2 min-w-[160px]"
              >
                {isToggling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                Resume Trading
              </Button>
            ) : (
              // Pause — requires confirmation
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={isToggling}
                    className="font-semibold px-6 gap-2 min-w-[160px]"
                  >
                    {isToggling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-4 h-4" />
                    )}
                    Pause All Trades
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-slate-900 border-slate-700 text-slate-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-400">
                      <ShieldAlert className="w-5 h-5" />
                      Activate Kill Switch?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                      This will immediately <strong className="text-slate-200">pause all copy trade jobs</strong> and delay any new ones by 30 seconds. The queue auto-resumes after 1 hour, or you can release it manually.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="mt-1">
                    <label className="text-xs text-slate-400 block mb-1.5">
                      Reason <span className="text-slate-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. High spread event, MetaApi issue…"
                      className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-100 text-sm px-3 py-2 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                      onClick={() => setReason("")}
                    >
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleActivate}
                      className="bg-red-600 hover:bg-red-500 text-white font-semibold"
                    >
                      Yes, Pause All Trades
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Redis health card ────────────────────────────────────────────────────────

function RedisCard({ redis, checkedAt }: { redis: RedisInfo; checkedAt: string }) {
  const ok = redis.status === "ok";
  const err = redis.status === "error";

  return (
    <Card className={`border ${ok ? "border-green-500/25 bg-green-500/5" : err ? "border-red-500/25 bg-red-500/5" : "border-slate-700 bg-slate-800/40"}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-md p-2 shrink-0 ${ok ? "bg-green-500/15 text-green-400" : err ? "bg-red-500/15 text-red-400" : "bg-slate-700 text-slate-400"}`}>
            <Zap className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-slate-200">Redis</span>
              {ok ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Connected</span>
              ) : err ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Error</span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">Not configured</span>
              )}
              {ok && redis.latencyMs !== null && (
                <span className="text-xs text-slate-500">{redis.latencyMs}ms</span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono truncate">{redis.url}</p>
            <p className="text-xs text-slate-600 mt-1">
              Checked {formatDistanceToNow(new Date(checkedAt), { addSuffix: true })}
            </p>
          </div>
          {ok ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Metric chip ──────────────────────────────────────────────────────────────

function MetricChip({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: "slate" | "blue" | "green" | "red" | "yellow" | "orange";
}) {
  const colorMap: Record<string, string> = {
    slate:  "bg-slate-700/40 text-slate-400",
    blue:   "bg-blue-500/10 text-blue-400",
    green:  "bg-green-500/10 text-green-400",
    red:    "bg-red-500/10 text-red-400",
    yellow: "bg-yellow-500/10 text-yellow-400",
    orange: "bg-orange-500/10 text-orange-400",
  };

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${colorMap[color]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs opacity-70 leading-none mb-0.5">{label}</p>
        <p className="text-lg font-bold leading-none">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

// ─── Queue depth card ─────────────────────────────────────────────────────────

function QueueCard({ queue }: { queue: QueueStats }) {
  return (
    <Card className={`border ${queue.failed > 0 ? "border-red-500/20" : "border-slate-800"} bg-slate-900`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-200">{queue.label}</CardTitle>
            <p className="text-xs text-slate-600 font-mono mt-0.5">{queue.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {queue.failed > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                <AlertTriangle className="w-3 h-3" />
                {queue.failed} failed
              </span>
            )}
            {queue.active > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 animate-pulse">
                <Play className="w-3 h-3" />
                {queue.active} active
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <MetricChip icon={ListTodo}    label="Waiting"   value={queue.waiting}   color="slate" />
          <MetricChip icon={Play}        label="Active"    value={queue.active}    color="blue" />
          <MetricChip icon={CheckCheck}  label="Completed" value={queue.completed} color="green" />
          <MetricChip icon={Ban}         label="Failed"    value={queue.failed}    color={queue.failed > 0 ? "red" : "slate"} />
          <MetricChip icon={Timer}       label="Delayed"   value={queue.delayed}   color={queue.delayed > 0 ? "yellow" : "slate"} />
          <MetricChip icon={ServerCrash} label="Paused"    value={queue.paused}    color={queue.paused > 0 ? "orange" : "slate"} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Throughput chart ─────────────────────────────────────────────────────────

function ThroughputChart({ samples, queues }: { samples: Sample[]; queues: QueueStats[] }) {
  if (samples.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-600 text-sm gap-2">
        <Clock className="w-4 h-4" />
        Collecting throughput data… (refreshes every 5 s)
      </div>
    );
  }

  const COLORS = ["#22c55e", "#60a5fa", "#f59e0b", "#f87171"];

  const chartData = samples.slice(1).map((s, i) => {
    const prev = samples[i];
    const entry: Record<string, number | string> = { ts: format(new Date(s.ts), "HH:mm:ss") };
    for (const q of queues) {
      entry[q.label] = Math.max(0, (s.completed[q.name] ?? 0) - (prev.completed[q.name] ?? 0));
    }
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <XAxis dataKey="ts" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#e2e8f0" }}
        />
        {queues.map((q, i) => (
          <Bar key={q.name} dataKey={q.label} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === queues.length - 1 ? [3, 3, 0, 0] : undefined}>
            {chartData.map((_e, idx) => <Cell key={idx} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Failed jobs table ────────────────────────────────────────────────────────

function FailedJobsTable({ jobs }: { jobs: FailedJob[] }) {
  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-slate-600 text-sm">
        <CheckCircle2 className="w-4 h-4 text-green-500/50" />
        No failed jobs — queues are clean.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-800">
      <Table>
        <TableHeader className="bg-slate-950/50">
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="text-slate-400 w-36">Queue</TableHead>
            <TableHead className="text-slate-400">Job Name</TableHead>
            <TableHead className="text-slate-400">Error</TableHead>
            <TableHead className="text-slate-400 w-16 text-center">Attempts</TableHead>
            <TableHead className="text-right text-slate-400 w-36">Failed At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job, i) => (
            <TableRow key={`${job.jobId}-${i}`} className="border-slate-800 hover:bg-slate-800/40">
              <TableCell>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300">
                  {job.queue}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs text-slate-300 max-w-[200px] truncate">{job.name}</TableCell>
              <TableCell className="text-xs text-red-400 max-w-[300px]">
                <span className="line-clamp-2" title={job.failedReason}>{job.failedReason}</span>
              </TableCell>
              <TableCell className="text-center text-xs text-slate-500">{job.attemptsMade}</TableCell>
              <TableCell className="text-right text-xs text-slate-500">
                {job.finishedOn ? formatDistanceToNow(new Date(job.finishedOn), { addSuffix: true }) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QueueMonitor() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const samplesRef = useRef<Sample[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const QUERY_KEY = ["admin-queue-monitor"];

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<QueueMonitorData>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<QueueMonitorData>("/api/admin/queue-monitor"),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  // Record throughput samples
  useEffect(() => {
    if (!data) return;
    const completed: Record<string, number> = {};
    for (const q of data.queues) completed[q.name] = q.completed;
    const next = [...samplesRef.current, { ts: Date.now(), completed }];
    if (next.length > MAX_SAMPLES) next.splice(0, next.length - MAX_SAMPLES);
    samplesRef.current = next;
    setSamples([...next]);
  }, [data]);

  // Kill switch mutation
  const toggleMutation = useMutation({
    mutationFn: ({ active, reason }: { active: boolean; reason?: string }) =>
      customFetch<{ active: boolean; message: string }>("/api/admin/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, reason }),
      }),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({
        title: vars.active ? "Kill switch activated" : "Kill switch released",
        description: result.message,
        variant: vars.active ? "destructive" : "default",
      });
    },
    onError: (err) => {
      toast({
        title: "Kill switch error",
        description: err instanceof Error ? err.message : "Failed to toggle kill switch",
        variant: "destructive",
      });
    },
  });

  const handleKillSwitchToggle = (active: boolean, reason?: string) => {
    toggleMutation.mutate({ active, reason });
  };

  const totalActive  = data?.queues.reduce((s, q) => s + q.active,  0) ?? 0;
  const totalFailed  = data?.queues.reduce((s, q) => s + q.failed,  0) ?? 0;
  const totalWaiting = data?.queues.reduce((s, q) => s + q.waiting, 0) ?? 0;
  const killActive   = data?.killSwitch.active ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-50 flex items-center gap-3">
            <Activity className="w-7 h-7 text-green-400" />
            Queue Monitor
          </h2>
          <p className="text-slate-400 mt-1">
            Live BullMQ queue depth, job throughput, Redis health, and emergency kill switch.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {killActive && (
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse">
              <ShieldAlert className="w-3 h-3" />
              PAUSED
            </span>
          )}
          {!killActive && totalActive > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 animate-pulse">
              <Play className="w-3 h-3" />
              {totalActive} active
            </span>
          )}
          {totalFailed > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
              <AlertTriangle className="w-3 h-3" />
              {totalFailed} failed
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 gap-2 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading queue stats…</span>
        </div>
      ) : !data ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="py-10 text-center text-slate-500">Failed to load queue data.</CardContent>
        </Card>
      ) : (
        <>
          {/* Kill switch — always at top */}
          <KillSwitchPanel
            killSwitch={data.killSwitch}
            onToggle={handleKillSwitchToggle}
            isToggling={toggleMutation.isPending}
          />

          {/* Summary chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-400 mb-1">Total Waiting</p>
                <p className="text-2xl font-bold text-slate-50">{totalWaiting}</p>
              </CardContent>
            </Card>
            <Card className={`border ${totalActive > 0 ? "border-blue-500/20 bg-blue-500/5" : "bg-slate-900 border-slate-800"}`}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-400 mb-1">Total Active</p>
                <p className={`text-2xl font-bold ${totalActive > 0 ? "text-blue-400" : "text-slate-50"}`}>{totalActive}</p>
              </CardContent>
            </Card>
            <Card className={`border ${totalFailed > 0 ? "border-red-500/20 bg-red-500/5" : "bg-slate-900 border-slate-800"}`}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-400 mb-1">Total Failed</p>
                <p className={`text-2xl font-bold ${totalFailed > 0 ? "text-red-400" : "text-slate-50"}`}>{totalFailed}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-400 mb-1">Last Updated</p>
                <p className="text-sm font-semibold text-slate-300">
                  {dataUpdatedAt ? formatDistanceToNow(dataUpdatedAt, { addSuffix: true }) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Redis health */}
          <RedisCard redis={data.redis} checkedAt={data.checkedAt} />

          {/* Queue depth cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.queues.map((q) => <QueueCard key={q.name} queue={q} />)}
          </div>

          {/* Throughput chart */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-50 text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400" />
                Job Throughput
                <span className="text-xs font-normal text-slate-500 ml-1">
                  completed jobs per 5-second interval (last {MAX_SAMPLES} samples)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ThroughputChart samples={samples} queues={data.queues} />
              <div className="flex gap-4 mt-3 flex-wrap">
                {data.queues.map((q, i) => {
                  const COLORS = ["#22c55e", "#60a5fa", "#f59e0b", "#f87171"];
                  return (
                    <div key={q.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      {q.label}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent failed jobs */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-50 text-base flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-400" />
                  Recent Failed Jobs
                </CardTitle>
                {data.recentFailed.length > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                    {data.recentFailed.length} job{data.recentFailed.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <FailedJobsTable jobs={data.recentFailed} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
