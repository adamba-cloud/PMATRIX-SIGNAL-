import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Activity, RefreshCw, Loader2, CheckCircle2, XCircle,
  Clock, AlertTriangle, Zap, ServerCrash, ListTodo, Play,
  CheckCheck, Ban, Timer,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type RedisInfo = {
  status: "ok" | "error" | "not_configured";
  latencyMs: number | null;
  url: string;
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
  queues: QueueStats[];
  recentFailed: FailedJob[];
};

// ─── Throughput tracker ────────────────────────────────────────────────────────
// We record completed-job counts from each poll and compute deltas to draw a
// bar chart showing jobs completed per 5-second interval (last 60 samples = 5 min).

const MAX_SAMPLES = 60;

type Sample = { ts: number; completed: Record<string, number> };

// ─── Redis health badge ────────────────────────────────────────────────────────

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

// ─── Single metric chip ────────────────────────────────────────────────────────

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
  const colorMap = {
    slate: "bg-slate-700/40 text-slate-400",
    blue:  "bg-blue-500/10 text-blue-400",
    green: "bg-green-500/10 text-green-400",
    red:   "bg-red-500/10 text-red-400",
    yellow:"bg-yellow-500/10 text-yellow-400",
    orange:"bg-orange-500/10 text-orange-400",
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
  const hasIssues = queue.failed > 0 || queue.active > 0;

  return (
    <Card className={`border ${queue.failed > 0 ? "border-red-500/20" : "border-slate-800"} bg-slate-900`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">{queue.label}</CardTitle>
          {hasIssues && queue.failed > 0 && (
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
        <p className="text-xs text-slate-600 font-mono">{queue.name}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <MetricChip icon={ListTodo}  label="Waiting"   value={queue.waiting}   color="slate" />
          <MetricChip icon={Play}      label="Active"    value={queue.active}    color="blue" />
          <MetricChip icon={CheckCheck}label="Completed" value={queue.completed} color="green" />
          <MetricChip icon={Ban}       label="Failed"    value={queue.failed}    color={queue.failed > 0 ? "red" : "slate"} />
          <MetricChip icon={Timer}     label="Delayed"   value={queue.delayed}   color={queue.delayed > 0 ? "yellow" : "slate"} />
          <MetricChip icon={ServerCrash} label="Paused" value={queue.paused}    color={queue.paused > 0 ? "orange" : "slate"} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Throughput chart ──────────────────────────────────────────────────────────

function ThroughputChart({
  samples,
  queues,
}: {
  samples: Sample[];
  queues: QueueStats[];
}) {
  if (samples.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-600 text-sm gap-2">
        <Clock className="w-4 h-4" />
        Collecting throughput data… (refreshes every 5 s)
      </div>
    );
  }

  const chartData = samples.slice(1).map((s, i) => {
    const prev = samples[i];
    const entry: Record<string, number | string> = {
      ts: format(new Date(s.ts), "HH:mm:ss"),
    };
    for (const q of queues) {
      const curr = s.completed[q.name] ?? 0;
      const p = prev.completed[q.name] ?? 0;
      entry[q.label] = Math.max(0, curr - p);
    }
    return entry;
  });

  const COLORS = ["#22c55e", "#60a5fa", "#f59e0b", "#f87171"];

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="ts"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#e2e8f0" }}
        />
        {queues.map((q, i) => (
          <Bar key={q.name} dataKey={q.label} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === queues.length - 1 ? [3, 3, 0, 0] : undefined}>
            {chartData.map((_entry, idx) => (
              <Cell key={idx} fill={COLORS[i % COLORS.length]} />
            ))}
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
            <TableHead className="text-slate-400 w-32">Queue</TableHead>
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
              <TableCell className="font-mono text-xs text-slate-300 max-w-[200px] truncate">
                {job.name}
              </TableCell>
              <TableCell className="text-xs text-red-400 max-w-[300px]">
                <span className="line-clamp-2" title={job.failedReason}>
                  {job.failedReason}
                </span>
              </TableCell>
              <TableCell className="text-center text-xs text-slate-500">
                {job.attemptsMade}
              </TableCell>
              <TableCell className="text-right text-xs text-slate-500">
                {job.finishedOn
                  ? formatDistanceToNow(new Date(job.finishedOn), { addSuffix: true })
                  : "—"}
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

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<QueueMonitorData>({
    queryKey: ["admin-queue-monitor"],
    queryFn: () => customFetch<QueueMonitorData>("/api/admin/queue-monitor"),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  // Record sample on every successful fetch
  useEffect(() => {
    if (!data) return;
    const completed: Record<string, number> = {};
    for (const q of data.queues) completed[q.name] = q.completed;

    const next = [...samplesRef.current, { ts: Date.now(), completed }];
    if (next.length > MAX_SAMPLES) next.splice(0, next.length - MAX_SAMPLES);
    samplesRef.current = next;
    setSamples([...next]);
  }, [data]);

  const totalActive = data?.queues.reduce((s, q) => s + q.active, 0) ?? 0;
  const totalFailed = data?.queues.reduce((s, q) => s + q.failed, 0) ?? 0;
  const totalWaiting = data?.queues.reduce((s, q) => s + q.waiting, 0) ?? 0;

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
            Live BullMQ queue depth, job throughput, and Redis health.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {totalActive > 0 && (
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
            {data.queues.map((q) => (
              <QueueCard key={q.name} queue={q} />
            ))}
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
              {/* Legend */}
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
