import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetAdminSummary, getGetAdminSummaryQueryKey, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, ShieldCheck, CreditCard, DollarSign, Loader2,
  Database, Zap, Smartphone, BarChart2, Mail, Bell, KeyRound,
  RefreshCw, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────

type ServiceStatus = {
  id: string;
  name: string;
  status: "ok" | "error" | "not_configured";
  detail: string;
  latencyMs: number | null;
};

type HealthResponse = {
  checkedAt: string;
  services: ServiceStatus[];
};

// ─── Service icon map ───────────────────────────────────────────────────────

const SERVICE_ICONS: Record<string, React.ElementType> = {
  database: Database,
  redis: Zap,
  daraja: Smartphone,
  metaapi: BarChart2,
  smtp: Mail,
  vapid: Bell,
  jwt: KeyRound,
};

// ─── Status helpers ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ServiceStatus["status"] }) {
  if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
  if (status === "error") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  return <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />;
}

function StatusBadge({ status }: { status: ServiceStatus["status"] }) {
  if (status === "ok")
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Operational</span>;
  if (status === "error")
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Error</span>;
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">Not Configured</span>;
}

// ─── Service Health Card ────────────────────────────────────────────────────

function ServiceHealthCard() {
  const [manualRefresh, setManualRefresh] = useState(0);

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<HealthResponse>({
    queryKey: ["admin-health-services", manualRefresh],
    queryFn: () => customFetch("/api/admin/health-services"),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const okCount = data?.services.filter((s) => s.status === "ok").length ?? 0;
  const errorCount = data?.services.filter((s) => s.status === "error").length ?? 0;
  const totalCount = data?.services.length ?? 0;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-slate-50 text-base">Service Health</CardTitle>
            {data && (
              <span className="text-xs text-slate-500">
                {okCount}/{totalCount} operational
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                {errorCount} issue{errorCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {dataUpdatedAt ? (
              <span className="text-xs text-slate-600 hidden sm:block">
                Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              onClick={() => { setManualRefresh((n) => n + 1); refetch(); }}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span className="ml-1.5 text-xs">Refresh</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Checking services…</span>
          </div>
        ) : !data ? (
          <div className="text-center py-8 text-slate-500 text-sm">Failed to load service status.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.services.map((svc) => {
              const Icon = SERVICE_ICONS[svc.id] ?? Database;
              return (
                <div
                  key={svc.id}
                  className={`rounded-lg border p-3.5 flex gap-3 items-start transition-colors ${
                    svc.status === "ok"
                      ? "border-green-500/20 bg-green-500/5"
                      : svc.status === "error"
                      ? "border-red-500/25 bg-red-500/5"
                      : "border-slate-700/60 bg-slate-800/40"
                  }`}
                >
                  <div
                    className={`mt-0.5 rounded-md p-1.5 shrink-0 ${
                      svc.status === "ok"
                        ? "bg-green-500/15 text-green-400"
                        : svc.status === "error"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-slate-700/60 text-slate-400"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-slate-200 leading-none">{svc.name}</span>
                      <StatusBadge status={svc.status} />
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed break-words">{svc.detail}</p>
                    {svc.latencyMs !== null && (
                      <p className="text-xs text-slate-600 mt-1">{svc.latencyMs}ms</p>
                    )}
                  </div>
                  <StatusDot status={svc.status} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: summary, isLoading } = useGetAdminSummary({ query: { queryKey: getGetAdminSummaryQueryKey() } });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Admin Overview</h2>
        <p className="text-slate-400">System performance, user metrics, and service health.</p>
      </div>

      {/* Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Users</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-50">{summary.totalUsers}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Active Subs</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-50">{summary.activeSubscriptions}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">KES {summary.totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Pending Payments</CardTitle>
            <CreditCard className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-50">{summary.pendingPayments}</div>
          </CardContent>
        </Card>
      </div>

      {/* Service Health */}
      <ServiceHealthCard />

      {/* Recent Users */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50">Recent Registrations</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.recentUsers && summary.recentUsers.length > 0 ? (
            <div className="rounded-md border border-slate-800">
              <Table>
                <TableHeader className="bg-slate-950/50">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Role</TableHead>
                    <TableHead className="text-right text-slate-400">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recentUsers.map((user) => (
                    <TableRow key={user.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-medium text-slate-200">{user.name}</TableCell>
                      <TableCell className="text-slate-400">{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={user.role === "ADMIN" ? "border-purple-500 text-purple-500" : "border-slate-600 text-slate-400"}
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-400">
                        {format(new Date(user.createdAt), "MMM dd, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">No recent users.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
