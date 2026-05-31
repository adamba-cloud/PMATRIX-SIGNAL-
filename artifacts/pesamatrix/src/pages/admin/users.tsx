import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListUsers,
  useAdminResetPassword,
  useAdminForcePasswordChange,
  useAdminSetSuspended,
  useAdminChangeRole,
  useAdminDeleteUser,
  useAdminBulkAction,
  getAdminListUsersQueryKey,
  type AdminUser,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  MoreHorizontal,
  Search,
  Users,
  ShieldCheck,
  Ban,
  KeyRound,
  RefreshCw,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Copy,
  CheckSquare,
  Square,
} from "lucide-react";
import { format } from "date-fns";

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-md ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-100">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Reset Password Dialog ────────────────────────────────────────────────────

function ResetPasswordDialog({
  open, tempPassword, onClose,
}: { open: boolean; tempPassword: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-50 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-slate-50">Temporary Password</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Share this with the user. They will be required to change it on next login.
          </p>
          <div className="flex items-center gap-2 p-3 rounded-md bg-slate-800 border border-slate-700 font-mono text-green-400 text-sm">
            <span className="flex-1 select-all">{tempPassword}</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100" onClick={copy}>
              {copied ? <CheckSquare className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <Button className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row Actions ──────────────────────────────────────────────────────────────

function UserRowActions({
  user, currentAdminId, onRefresh,
}: { user: AdminUser; currentAdminId?: number; onRefresh: () => void }) {
  const { toast } = useToast();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isSelf = user.id === currentAdminId;

  const resetPassword = useAdminResetPassword({
    mutation: {
      onSuccess: (data) => { setTempPassword(data.tempPassword); onRefresh(); },
      onError: () => toast({ title: "Reset failed", variant: "destructive" }),
    },
  });

  const forceChange = useAdminForcePasswordChange({
    mutation: {
      onSuccess: () => { toast({ title: "Password change required on next login" }); onRefresh(); },
      onError: () => toast({ title: "Action failed", variant: "destructive" }),
    },
  });

  const setSuspended = useAdminSetSuspended({
    mutation: {
      onSuccess: (u) => { toast({ title: u.suspended ? "User suspended" : "User unsuspended" }); onRefresh(); },
      onError: () => toast({ title: "Action failed", variant: "destructive" }),
    },
  });

  const changeRole = useAdminChangeRole({
    mutation: {
      onSuccess: (u) => { toast({ title: `Role changed to ${u.role}` }); onRefresh(); },
      onError: () => toast({ title: "Action failed", variant: "destructive" }),
    },
  });

  const deleteUser = useAdminDeleteUser({
    mutation: {
      onSuccess: () => { toast({ title: "User deleted" }); onRefresh(); },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    },
  });

  const busy = resetPassword.isPending || forceChange.isPending || setSuspended.isPending ||
    changeRole.isPending || deleteUser.isPending;

  return (
    <>
      <ResetPasswordDialog
        open={tempPassword !== null}
        tempPassword={tempPassword}
        onClose={() => setTempPassword(null)}
      />
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-50">Delete {user.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This permanently removes the user and all their data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteUser.mutate({ id: user.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500 hover:text-slate-200" disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200 w-52">
          <DropdownMenuItem
            className="hover:bg-slate-700 cursor-pointer gap-2"
            onClick={() => resetPassword.mutate({ id: user.id })}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Password
          </DropdownMenuItem>
          <DropdownMenuItem
            className="hover:bg-slate-700 cursor-pointer gap-2"
            onClick={() => forceChange.mutate({ id: user.id })}
            disabled={user.mustChangePassword}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Force Password Change
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-slate-700" />
          {user.suspended ? (
            <DropdownMenuItem
              className="hover:bg-slate-700 cursor-pointer gap-2 text-green-400"
              onClick={() => setSuspended.mutate({ id: user.id, suspended: false })}
              disabled={isSelf}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Unsuspend
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="hover:bg-slate-700 cursor-pointer gap-2 text-yellow-400"
              onClick={() => setSuspended.mutate({ id: user.id, suspended: true })}
              disabled={isSelf}
            >
              <Ban className="w-3.5 h-3.5" />
              Suspend
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-slate-700" />
          {user.role === "USER" ? (
            <DropdownMenuItem
              className="hover:bg-slate-700 cursor-pointer gap-2 text-green-400"
              onClick={() => changeRole.mutate({ id: user.id, role: "ADMIN" })}
              disabled={isSelf}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              Promote to Admin
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="hover:bg-slate-700 cursor-pointer gap-2 text-slate-400"
              onClick={() => changeRole.mutate({ id: user.id, role: "USER" })}
              disabled={isSelf}
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              Demote to User
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-slate-700" />
          <DropdownMenuItem
            className="hover:bg-slate-700 cursor-pointer gap-2 text-red-400"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSelf}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<"suspend" | "unsuspend" | "force-password-change" | null>(null);

  const { data: users = [], isLoading } = useAdminListUsers({
    query: { queryKey: getAdminListUsersQueryKey(), refetchInterval: 30_000 },
  });

  const bulkMutation = useAdminBulkAction({
    mutation: {
      onSuccess: (result) => {
        toast({ title: `Bulk action: ${result.success} succeeded${result.failed ? `, ${result.failed} failed` : ""}` });
        setSelected(new Set());
        setBulkAction(null);
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      },
      onError: () => toast({ title: "Bulk action failed", variant: "destructive" }),
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users;
  }, [users, search]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === "ADMIN").length,
    suspended: users.filter((u) => u.suspended).length,
    mustChange: users.filter((u) => u.mustChangePassword).length,
  }), [users]);

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((u) => u.id)));
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const executeBulk = () => {
    if (!bulkAction || selected.size === 0) return;
    bulkMutation.mutate({ ids: Array.from(selected), action: bulkAction });
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
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">User Management</h2>
        <p className="text-slate-400 mt-1">Manage all registered users — reset passwords, suspend accounts, control access.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={stats.total} icon={Users} color="bg-slate-700 text-slate-300" />
        <StatCard label="Admins" value={stats.admins} icon={ShieldCheck} color="bg-green-500/10 text-green-400" />
        <StatCard label="Suspended" value={stats.suspended} icon={Ban} color="bg-red-500/10 text-red-400" />
        <StatCard label="Must Change PW" value={stats.mustChange} icon={KeyRound} color="bg-yellow-500/10 text-yellow-400" />
      </div>

      {/* Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-slate-50 text-base">All Users</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500 h-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Bulk actions bar */}
          {someSelected && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-md bg-slate-800 border border-slate-700">
              <span className="text-sm text-slate-400">{selected.size} selected</span>
              <div className="flex gap-2 ml-auto flex-wrap">
                {[
                  { action: "suspend" as const, label: "Suspend All", color: "text-yellow-400 border-yellow-700 hover:bg-yellow-500/10" },
                  { action: "unsuspend" as const, label: "Unsuspend All", color: "text-green-400 border-green-700 hover:bg-green-500/10" },
                  { action: "force-password-change" as const, label: "Force PW Change", color: "text-slate-300 border-slate-600 hover:bg-slate-700" },
                ].map(({ action, label, color }) => (
                  <Button
                    key={action}
                    size="sm"
                    variant="outline"
                    className={`h-7 text-xs border ${color}`}
                    onClick={() => { setBulkAction(action); executeBulk(); }}
                    disabled={bulkMutation.isPending}
                  >
                    {bulkMutation.isPending && bulkAction === action
                      ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      : null}
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40">
                  <th className="w-10 px-3 py-2.5">
                    <button onClick={toggleAll} className="text-slate-500 hover:text-slate-200">
                      {allSelected
                        ? <CheckSquare className="w-4 h-4 text-green-400" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  {["User", "Role", "Status", "Registered", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-500 text-sm">
                      {search ? "No users match your search." : "No users found."}
                    </td>
                  </tr>
                ) : filtered.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors ${
                      user.suspended ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleOne(user.id)} className="text-slate-500 hover:text-slate-200">
                        {selected.has(user.id)
                          ? <CheckSquare className="w-4 h-4 text-green-400" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-200">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={user.role === "ADMIN"
                          ? "border-green-600 text-green-400 bg-green-500/10"
                          : "border-slate-700 text-slate-400"}
                      >
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {user.suspended && (
                          <Badge variant="outline" className="border-red-700 text-red-400 bg-red-500/10 text-xs">
                            Suspended
                          </Badge>
                        )}
                        {user.mustChangePassword && (
                          <Badge variant="outline" className="border-yellow-700 text-yellow-400 bg-yellow-500/10 text-xs">
                            PW Required
                          </Badge>
                        )}
                        {!user.suspended && !user.mustChangePassword && (
                          <Badge variant="outline" className="border-slate-700 text-slate-500 text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                      {format(new Date(user.createdAt), "MMM dd, yyyy")}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <UserRowActions user={user} onRefresh={refresh} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <p className="text-xs text-slate-600 mt-3 text-right">
              Showing {filtered.length} of {users.length} users
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
