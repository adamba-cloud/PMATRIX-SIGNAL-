import { useState } from "react";
import {
  useAdminListMt5Accounts,
  useAdminReconnectMt5Account,
  useAdminDisconnectMt5Account,
  getAdminListMt5AccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, WifiOff, Wifi, AlertTriangle, Activity, Cpu } from "lucide-react";
import { format } from "date-fns";

type Mt5Status = "CONNECTED" | "SYNCING" | "DISCONNECTED" | "ERROR";

const STATUS_CONFIG: Record<Mt5Status, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  CONNECTED: {
    label: "Connected",
    badgeClass: "border-green-500 text-green-400 bg-green-500/10",
    icon: <Wifi className="w-3 h-3" />,
  },
  SYNCING: {
    label: "Syncing",
    badgeClass: "border-yellow-500 text-yellow-400 bg-yellow-500/10",
    icon: <Activity className="w-3 h-3 animate-pulse" />,
  },
  DISCONNECTED: {
    label: "Disconnected",
    badgeClass: "border-slate-600 text-slate-400 bg-slate-500/10",
    icon: <WifiOff className="w-3 h-3" />,
  },
  ERROR: {
    label: "Error",
    badgeClass: "border-red-500 text-red-400 bg-red-500/10",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
};

function StatusBadge({ status }: { status: Mt5Status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DISCONNECTED;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.badgeClass}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

export default function AdminMt5() {
  const queryClient = useQueryClient();
  const { data: accounts = [], isLoading } = useAdminListMt5Accounts({
    query: { queryKey: getAdminListMt5AccountsQueryKey() },
  });
  const reconnectMutation = useAdminReconnectMt5Account();
  const disconnectMutation = useAdminDisconnectMt5Account();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getAdminListMt5AccountsQueryKey() });

  const handleReconnect = (id: number) => {
    reconnectMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Reconnect initiated" });
          invalidate();
        },
        onError: () => toast({ title: "Failed to reconnect", variant: "destructive" }),
      }
    );
  };

  const handleDisconnect = (id: number) => {
    disconnectMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Account disconnected" });
          invalidate();
        },
        onError: () => toast({ title: "Failed to disconnect", variant: "destructive" }),
      }
    );
  };

  const filtered =
    statusFilter === "ALL"
      ? accounts
      : accounts.filter((a) => a.status === statusFilter);

  const counts = {
    total: accounts.length,
    connected: accounts.filter((a) => a.status === "CONNECTED").length,
    syncing: accounts.filter((a) => a.status === "SYNCING").length,
    disconnected: accounts.filter((a) => a.status === "DISCONNECTED").length,
    error: accounts.filter((a) => a.status === "ERROR").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">MT5 Accounts</h2>
        <p className="text-slate-400">Monitor and manage all connected MT5 accounts across users.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Accounts", value: counts.total, color: "text-slate-50" },
          { label: "Connected", value: counts.connected, color: "text-green-400" },
          { label: "Syncing", value: counts.syncing, color: "text-yellow-400" },
          { label: "Error / Offline", value: counts.error + counts.disconnected, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-1 pt-4 px-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-slate-50 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-green-500" />
            All Accounts
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-slate-300 text-sm h-8">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="CONNECTED">Connected</SelectItem>
                <SelectItem value="SYNCING">Syncing</SelectItem>
                <SelectItem value="DISCONNECTED">Disconnected</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={invalidate}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-7 h-7 text-green-500 animate-spin" />
            </div>
          ) : (
            <div className="rounded-md border border-slate-800">
              <Table>
                <TableHeader className="bg-slate-950/50">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400 w-14">ID</TableHead>
                    <TableHead className="text-slate-400">User</TableHead>
                    <TableHead className="text-slate-400">MT5 Login</TableHead>
                    <TableHead className="text-slate-400">Broker Server</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Last Sync</TableHead>
                    <TableHead className="text-slate-400">Connected</TableHead>
                    <TableHead className="text-right text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((account) => (
                    <TableRow key={account.id} className="border-slate-800 hover:bg-slate-800/40">
                      <TableCell className="font-mono text-slate-500 text-xs">#{account.id}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-slate-200 text-sm font-medium">{account.userName}</p>
                          <p className="text-slate-500 text-xs">{account.userEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-slate-200 text-sm">{account.mt5Login}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{account.brokerServer}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <StatusBadge status={account.status as Mt5Status} />
                          {account.statusMessage && (
                            <p className="text-xs text-slate-500 max-w-[180px] truncate" title={account.statusMessage}>
                              {account.statusMessage}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {account.lastSyncAt
                          ? format(new Date(account.lastSyncAt), "MMM dd, HH:mm")
                          : <span className="text-slate-600">Never</span>}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {format(new Date(account.createdAt), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-xs"
                            onClick={() => handleReconnect(account.id)}
                            disabled={
                              reconnectMutation.isPending || account.status === "SYNCING"
                            }
                          >
                            {reconnectMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Reconnect
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 border-red-800/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
                            onClick={() => handleDisconnect(account.id)}
                            disabled={
                              disconnectMutation.isPending || account.status === "DISCONNECTED"
                            }
                          >
                            <WifiOff className="w-3 h-3 mr-1" />
                            Disconnect
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-28 text-center text-slate-500">
                        {statusFilter === "ALL"
                          ? "No MT5 accounts connected yet."
                          : `No accounts with status "${statusFilter}".`}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
