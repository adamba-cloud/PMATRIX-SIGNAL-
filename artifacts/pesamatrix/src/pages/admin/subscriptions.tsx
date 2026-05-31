import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSubscriptions,
  getListSubscriptionsQueryKey,
  useListPayments,
  getListPaymentsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useAdminListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Loader2,
  ShieldCheck,
  Smartphone,
  CalendarDays,
  Banknote,
  Plus,
  Play,
  Clock,
  XCircle,
  Search,
} from "lucide-react";
import { format } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusClass(status: string) {
  if (status === "ACTIVE") return "border-green-500 text-green-400 bg-green-500/10";
  if (status === "PENDING") return "border-yellow-500 text-yellow-400 bg-yellow-500/10";
  if (status === "EXPIRED") return "border-red-500 text-red-400 bg-red-500/10";
  if (status === "CANCELLED") return "border-slate-500 text-slate-400 bg-slate-500/10";
  return "border-slate-500 text-slate-400 bg-slate-500/10";
}

const TODAY = new Date().toISOString().split("T")[0];

// ─── Grant Modal ──────────────────────────────────────────────────────────────

function GrantModal({
  open,
  onOpenChange,
  users,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: { id: number; name: string; email: string }[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string; email: string } | null>(null);
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return users.slice(0, 8);
    const q = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0, 8);
  }, [users, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    try {
      await customFetch("/api/admin/subscriptions/grant", {
        method: "POST",
        body: JSON.stringify({ userId: selectedUser.id, days: parseInt(days), note }),
      });
      toast({ title: "Access granted", description: `${days} days granted to ${selectedUser.name}.` });
      onSuccess();
      onOpenChange(false);
      setSelectedUser(null);
      setSearch("");
      setDays("30");
      setNote("");
    } catch {
      toast({ title: "Error", description: "Could not grant access.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-green-500" /> Grant Access
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* User search */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">User</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-white">{selectedUser.name}</p>
                  <p className="text-xs text-slate-400">{selectedUser.email}</p>
                </div>
                <button type="button" onClick={() => setSelectedUser(null)}
                  className="text-slate-500 hover:text-white ml-2">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white pl-9 focus:border-green-500 focus:ring-green-500/20"
                    placeholder="Search by name or email…"
                  />
                </div>
                {filtered.length > 0 && (
                  <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                    {filtered.map((u) => (
                      <button key={u.id} type="button" onClick={() => { setSelectedUser(u); setSearch(""); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 transition-colors text-left border-b border-slate-800/50 last:border-0">
                        <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-400 shrink-0">
                          {u.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm text-white">{u.name}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Days */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Days of Access</Label>
            <div className="flex gap-2">
              {["7", "14", "30", "90"].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all font-medium ${
                    days === d
                      ? "bg-green-500/20 border-green-500 text-green-400"
                      : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  {d}d
                </button>
              ))}
              <Input value={days} onChange={(e) => setDays(e.target.value)}
                type="number" min="1" className="bg-slate-950 border-slate-700 text-white w-20 text-sm focus:border-green-500 focus:ring-green-500/20"
                placeholder="…" />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Note <span className="text-slate-500 text-xs">(optional)</span></Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)}
              className="bg-slate-950 border-slate-700 text-white focus:border-green-500 focus:ring-green-500/20"
              placeholder="e.g. Trial period, Promo, Gift…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:text-white">
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedUser || loading}
              className="bg-green-600 hover:bg-green-500 text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Grant Access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Activate Modal ───────────────────────────────────────────────────────────

function ActivateModal({
  subId,
  open,
  onOpenChange,
  onSuccess,
}: {
  subId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [days, setDays] = useState("30");
  const [startDate, setStartDate] = useState(TODAY);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await customFetch(`/api/admin/subscriptions/${subId}/activate`, {
        method: "PATCH",
        body: JSON.stringify({ days: parseInt(days), startDate }),
      });
      toast({ title: "Subscription activated", description: `${days} days of access granted.` });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: "Error", description: "Could not activate subscription.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Play className="w-4 h-4 text-green-500" /> Activate Subscription #{subId}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Start Date</Label>
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)}
              type="date" className="bg-slate-950 border-slate-700 text-white focus:border-green-500 focus:ring-green-500/20" required />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Days of Access</Label>
            <div className="flex gap-2">
              {["7", "14", "30", "90"].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all font-medium ${
                    days === d
                      ? "bg-green-500/20 border-green-500 text-green-400"
                      : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  {d}d
                </button>
              ))}
              <Input value={days} onChange={(e) => setDays(e.target.value)}
                type="number" min="1" className="bg-slate-950 border-slate-700 text-white w-20 text-sm focus:border-green-500 focus:ring-green-500/20" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:text-white">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-500 text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Extend Modal ─────────────────────────────────────────────────────────────

function ExtendModal({
  subId,
  currentEndDate,
  open,
  onOpenChange,
  onSuccess,
}: {
  subId: number;
  currentEndDate: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(false);

  const newEnd = useMemo(() => {
    const base = currentEndDate && new Date(currentEndDate) > new Date()
      ? new Date(currentEndDate)
      : new Date();
    return new Date(base.getTime() + parseInt(days || "0") * 86400000);
  }, [currentEndDate, days]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await customFetch(`/api/admin/subscriptions/${subId}/extend`, {
        method: "PATCH",
        body: JSON.stringify({ days: parseInt(days) }),
      });
      toast({ title: "Subscription extended", description: `Added ${days} days.` });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: "Error", description: "Could not extend subscription.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" /> Extend Subscription #{subId}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {currentEndDate && (
            <p className="text-xs text-slate-400">
              Current end: <span className="text-white font-mono">{format(new Date(currentEndDate), "MMM dd, yyyy")}</span>
            </p>
          )}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Add Days</Label>
            <div className="flex gap-2">
              {["3", "7", "14", "30"].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all font-medium ${
                    days === d
                      ? "bg-blue-500/20 border-blue-500 text-blue-400"
                      : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  +{d}d
                </button>
              ))}
              <Input value={days} onChange={(e) => setDays(e.target.value)}
                type="number" min="1" className="bg-slate-950 border-slate-700 text-white w-20 text-sm focus:border-blue-500 focus:ring-blue-500/20" />
            </div>
          </div>
          {parseInt(days) > 0 && (
            <p className="text-xs text-slate-400">
              New end date: <span className="text-green-400 font-mono">{format(newEnd, "MMM dd, yyyy")}</span>
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:text-white">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Extend"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ModalState =
  | { type: "none" }
  | { type: "grant" }
  | { type: "activate"; subId: number }
  | { type: "extend"; subId: number; endDate: string | null }
  | { type: "revoke"; subId: number; userName: string };

export default function AdminSubscriptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [revoking, setRevoking] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const { data: subscriptions, isLoading } = useListSubscriptions({
    query: { queryKey: getListSubscriptionsQueryKey() },
  });
  const { data: payments } = useListPayments({
    query: { queryKey: getListPaymentsQueryKey() },
  });
  const { data: adminUsers } = useAdminListUsers();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
  };

  const paymentsBySubId = useMemo(
    () => new Map((payments ?? []).filter((p) => p.subscriptionId != null).map((p) => [p.subscriptionId, p])),
    [payments]
  );

  const usersById = useMemo(
    () => new Map((adminUsers ?? []).map((u) => [u.id, u])),
    [adminUsers]
  );

  const filtered = useMemo(() => {
    let list = subscriptions ?? [];
    if (statusFilter !== "ALL") list = list.filter((s) => s.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => {
        const u = usersById.get(s.userId);
        return (
          String(s.userId).includes(q) ||
          String(s.id).includes(q) ||
          u?.name.toLowerCase().includes(q) ||
          u?.email.toLowerCase().includes(q) ||
          (s.phoneNumber ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [subscriptions, statusFilter, search, usersById]);

  const stats = useMemo(() => ({
    active: subscriptions?.filter((s) => s.status === "ACTIVE").length ?? 0,
    pending: subscriptions?.filter((s) => s.status === "PENDING").length ?? 0,
    expired: subscriptions?.filter((s) => s.status === "EXPIRED").length ?? 0,
    revenue: subscriptions?.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + s.totalAmount, 0) ?? 0,
  }), [subscriptions]);

  const handleRevoke = async () => {
    if (modal.type !== "revoke") return;
    setRevoking(true);
    try {
      await customFetch(`/api/admin/subscriptions/${modal.subId}/revoke`, { method: "PATCH" });
      toast({ title: "Subscription revoked" });
      invalidate();
      setModal({ type: "none" });
    } catch {
      toast({ title: "Error", description: "Could not revoke subscription.", variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-50">Subscriptions</h2>
          <p className="text-slate-400">Manage user access — activate, extend, revoke, or grant manually.</p>
        </div>
        <Button onClick={() => setModal({ type: "grant" })}
          className="bg-green-600 hover:bg-green-500 text-white border-0 gap-2">
          <Plus className="w-4 h-4" /> Grant Access
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active", value: stats.active, color: "text-green-400" },
          { label: "Pending", value: stats.pending, color: "text-yellow-400" },
          { label: "Expired", value: stats.expired, color: "text-red-400" },
          { label: "Active Revenue", value: `KES ${stats.revenue.toLocaleString()}`, color: "text-slate-100" },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-900 border-slate-800">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <CardTitle className="text-slate-50 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-500" />
              All Subscriptions ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-2 sm:ml-auto">
              {/* Status filter */}
              <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1">
                {["ALL", "ACTIVE", "PENDING", "EXPIRED", "CANCELLED"].map((f) => (
                  <button key={f} onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      statusFilter === f ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"
                    }`}>
                    {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white pl-8 h-8 w-36 text-xs focus:border-green-500 focus:ring-green-500/20"
                  placeholder="Search user…" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-slate-700" />
              <p>No subscriptions match this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {["#", "User", "Status", "Duration", "Dates", "Payment", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sub) => {
                    const payment = paymentsBySubId.get(sub.id);
                    const user = usersById.get(sub.userId);
                    const daysLeft = sub.endDate
                      ? Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000))
                      : null;
                    const isManual = (sub.phoneNumber ?? "").startsWith("MANUAL");

                    return (
                      <tr key={sub.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors group">
                        {/* ID */}
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">#{sub.id}</td>

                        {/* User */}
                        <td className="px-4 py-3">
                          {user ? (
                            <div>
                              <p className="text-sm text-white font-medium">{user.name}</p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">User #{sub.userId}</p>
                          )}
                          {sub.phoneNumber && !isManual && (
                            <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                              <Smartphone className="w-3 h-3" />{sub.phoneNumber}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <Badge variant="outline" className={statusClass(sub.status)}>
                              {sub.status}
                            </Badge>
                            {daysLeft !== null && sub.status === "ACTIVE" && (
                              <p className={`text-xs font-mono ${daysLeft <= 3 ? "text-red-400" : "text-slate-500"}`}>
                                {daysLeft}d left
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-300 flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                            {sub.daysSelected}d
                          </p>
                          {sub.totalAmount > 0 ? (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Banknote className="w-3 h-3" />KES {sub.totalAmount.toLocaleString()}
                            </p>
                          ) : (
                            <p className="text-xs text-green-600 mt-0.5">Free / Manual</p>
                          )}
                        </td>

                        {/* Dates */}
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {sub.startDate && sub.endDate ? (
                            <>
                              <p>{format(new Date(sub.startDate), "MMM dd, yyyy")}</p>
                              <p className="text-slate-600">→ {format(new Date(sub.endDate), "MMM dd, yyyy")}</p>
                            </>
                          ) : (
                            <p className="text-slate-700">Not set</p>
                          )}
                        </td>

                        {/* Payment */}
                        <td className="px-4 py-3 text-xs">
                          {isManual ? (
                            <span className="text-green-600 font-medium">Manual</span>
                          ) : payment?.mpesaReceiptNumber ? (
                            <span className="font-mono text-green-400">{payment.mpesaReceiptNumber}</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {(sub.status === "PENDING" || sub.status === "EXPIRED" || sub.status === "CANCELLED") && (
                              <button
                                onClick={() => setModal({ type: "activate", subId: sub.id })}
                                title="Activate"
                                className="p-1.5 rounded text-slate-500 hover:text-green-400 hover:bg-green-500/10 transition-colors">
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {sub.status === "ACTIVE" && (
                              <button
                                onClick={() => setModal({ type: "extend", subId: sub.id, endDate: sub.endDate ?? null })}
                                title="Extend"
                                className="p-1.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(sub.status === "ACTIVE" || sub.status === "PENDING") && (
                              <button
                                onClick={() => setModal({ type: "revoke", subId: sub.id, userName: user?.name ?? `User #${sub.userId}` })}
                                title="Revoke"
                                className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
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

      {/* Grant Modal */}
      <GrantModal
        open={modal.type === "grant"}
        onOpenChange={(v) => { if (!v) setModal({ type: "none" }); }}
        users={adminUsers ?? []}
        onSuccess={invalidate}
      />

      {/* Activate Modal */}
      {modal.type === "activate" && (
        <ActivateModal
          subId={modal.subId}
          open
          onOpenChange={(v) => { if (!v) setModal({ type: "none" }); }}
          onSuccess={invalidate}
        />
      )}

      {/* Extend Modal */}
      {modal.type === "extend" && (
        <ExtendModal
          subId={modal.subId}
          currentEndDate={modal.endDate}
          open
          onOpenChange={(v) => { if (!v) setModal({ type: "none" }); }}
          onSuccess={invalidate}
        />
      )}

      {/* Revoke Confirm */}
      <AlertDialog open={modal.type === "revoke"} onOpenChange={(v) => { if (!v) setModal({ type: "none" }); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Revoke this subscription?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {modal.type === "revoke" && (
                <>This will immediately cancel access for <strong className="text-white">{modal.userName}</strong>. They will lose access to signals right away.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revoking}
              className="bg-red-600 hover:bg-red-500 text-white border-0">
              {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Revoke Access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
