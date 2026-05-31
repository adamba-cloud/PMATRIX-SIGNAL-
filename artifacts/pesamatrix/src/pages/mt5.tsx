import { useState } from "react";
import {
  useGetMt5Accounts,
  useConnectMt5Account,
  useDeleteMt5Account,
  useReconnectMt5Account,
  getGetMt5AccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";

type Mt5Status = "CONNECTED" | "SYNCING" | "DISCONNECTED" | "ERROR";

function StatusBadge({ status }: { status: Mt5Status }) {
  const map: Record<Mt5Status, { label: string; color: string; icon: React.ReactNode }> = {
    CONNECTED: {
      label: "Connected",
      color: "text-green-400 bg-green-500/10 border-green-500/20",
      icon: <Wifi className="w-3.5 h-3.5" />,
    },
    SYNCING: {
      label: "Syncing",
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

  const { label, color, icon } = map[status] ?? map.DISCONNECTED;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {icon}
      {label}
    </span>
  );
}

function ConnectAccountDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ mt5Login: "", mt5Password: "", brokerServer: "" });
  const { toast } = useToast();
  const mutation = useConnectMt5Account();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mt5Login || !form.mt5Password || !form.brokerServer) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }

    mutation.mutate(
      { data: { mt5Login: form.mt5Login, mt5Password: form.mt5Password, brokerServer: form.brokerServer } },
      {
        onSuccess: () => {
          toast({ title: "MT5 account connected successfully" });
          setForm({ mt5Login: "", mt5Password: "", brokerServer: "" });
          setOpen(false);
          onSuccess();
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to connect account";
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
          Connect MT5 Account
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-50">
        <DialogHeader>
          <DialogTitle className="text-slate-50">Connect MT5 Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="mt5Login" className="text-slate-300">MT5 Login (Account Number)</Label>
            <Input
              id="mt5Login"
              placeholder="e.g. 123456789"
              value={form.mt5Login}
              onChange={(e) => setForm((f) => ({ ...f, mt5Login: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, mt5Password: e.target.value }))}
              className="bg-slate-800 border-slate-700 text-slate-50 placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerServer" className="text-slate-300">Broker Server</Label>
            <Input
              id="brokerServer"
              placeholder="e.g. ICMarkets-Demo01"
              value={form.brokerServer}
              onChange={(e) => setForm((f) => ({ ...f, brokerServer: e.target.value }))}
              className="bg-slate-800 border-slate-700 text-slate-50 placeholder:text-slate-500"
            />
          </div>
          <div className="flex items-center gap-2 p-3 rounded-md bg-slate-800 border border-slate-700">
            <Cpu className="w-4 h-4 text-green-500 flex-shrink-0" />
            <p className="text-xs text-slate-400">
              Your password is encrypted with AES-256-GCM and never stored in plain text.
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
              Connect
            </Button>
          </div>
        </form>
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMt5AccountsQueryKey() });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Account removed" });
          invalidate();
        },
        onError: () => {
          toast({ title: "Failed to remove account", variant: "destructive" });
        },
      }
    );
  };

  const handleReconnect = (id: number) => {
    reconnectMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Reconnecting…" });
          invalidate();
        },
        onError: () => {
          toast({ title: "Failed to initiate reconnect", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">MT5 Accounts</h2>
          <p className="text-slate-400 mt-1">Manage your connected MetaTrader 5 accounts.</p>
        </div>
        <ConnectAccountDialog onSuccess={invalidate} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
              <Cpu className="w-7 h-7 text-slate-500" />
            </div>
            <div className="text-center">
              <p className="text-slate-300 font-medium">No MT5 accounts connected</p>
              <p className="text-slate-500 text-sm mt-1">
                Connect your first MT5 account to enable copy trading.
              </p>
            </div>
            <ConnectAccountDialog onSuccess={invalidate} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.id} className="bg-slate-900 border-slate-800">
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
                  <StatusBadge status={account.status as Mt5Status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {account.statusMessage && (
                  <p className="text-xs text-slate-400 bg-slate-800 rounded px-3 py-2 border border-slate-700">
                    {account.statusMessage}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Last Sync</p>
                    <p className="text-slate-300 mt-0.5">
                      {account.lastSyncAt
                        ? new Date(account.lastSyncAt).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Connected</p>
                    <p className="text-slate-300 mt-0.5">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                    onClick={() => handleReconnect(account.id)}
                    disabled={reconnectMutation.isPending || account.status === "SYNCING"}
                  >
                    {reconnectMutation.isPending ? (
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
                          <span className="text-slate-200">{account.brokerServer}</span>. This action
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(account.id)}
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
          ))}
        </div>
      )}

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50 text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-green-500" />
            MetaApi Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-slate-400">
            <p>
              MT5 accounts are onboarded and stored securely. MetaApi integration will be activated
              soon to enable:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-slate-500">
              <li>Automatic trade copying from PESAMATRIX signals</li>
              <li>Real-time account balance and equity tracking</li>
              <li>Position and trade history synchronisation</li>
              <li>Risk management controls per account</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
