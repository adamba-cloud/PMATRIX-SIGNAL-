import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Send, Radio, TrendingUp, TrendingDown, CheckSquare } from "lucide-react";
import { format } from "date-fns";

type Signal = {
  id: number;
  pair: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  status: "ACTIVE" | "CLOSED" | "PENDING";
  pips: number | null;
  createdAt: string;
};

const STATUS_COLORS = {
  ACTIVE: "bg-green-500/10 text-green-400 border-green-500/30",
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  CLOSED: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

export default function AdminSignals() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [closeSignal, setCloseSignal] = useState<Signal | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [blastId, setBlastId] = useState<number | null>(null);
  const [closePips, setClosePips] = useState("");
  const [form, setForm] = useState({
    pair: "",
    direction: "BUY" as "BUY" | "SELL",
    entryPrice: "",
    stopLoss: "",
    takeProfit: "",
  });

  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ["admin-signals"],
    queryFn: () => customFetch("/api/admin/signals").then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      customFetch("/api/admin/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-signals"] });
      setShowCreate(false);
      setForm({ pair: "", direction: "BUY", entryPrice: "", stopLoss: "", takeProfit: "" });
      toast({ title: "Signal created" });
    },
    onError: () => toast({ title: "Failed to create signal", variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, pips }: { id: number; pips: string }) =>
      customFetch(`/api/admin/signals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED", pips }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-signals"] });
      setCloseSignal(null);
      setClosePips("");
      toast({ title: "Signal closed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/signals/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-signals"] });
      setDeleteId(null);
      toast({ title: "Signal deleted" });
    },
  });

  const blastMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/signals/${id}/whatsapp-blast`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data, id) => {
      setBlastId(null);
      toast({
        title: `WhatsApp blast sent`,
        description: `${data.sent} sent · ${data.failed} failed · ${data.total} total subscribers`,
      });
    },
    onError: () => toast({ title: "Blast failed", variant: "destructive" }),
  });

  const activeCount = signals.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Signals Management</h2>
          <p className="text-muted-foreground">
            {activeCount} active signal{activeCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> New Signal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-green-500" />
        </div>
      ) : signals.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Radio className="w-10 h-10 mb-3 opacity-40" />
            <p>No signals yet. Create one to start broadcasting.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {signals.map((sig) => (
            <Card key={sig.id} className="bg-card border-border">
              <CardContent className="flex items-center gap-4 pt-5">
                <div className={`p-2 rounded-lg ${sig.direction === "BUY" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  {sig.direction === "BUY" ? (
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">{sig.pair}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sig.direction === "BUY" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}`}>
                      {sig.direction}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[sig.status]}`}>
                      {sig.status}
                    </span>
                    {sig.pips !== null && (
                      <span className={`text-xs font-medium ${sig.pips >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {sig.pips >= 0 ? "+" : ""}{sig.pips} pips
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span>Entry: {sig.entryPrice}</span>
                    <span>SL: {sig.stopLoss}</span>
                    <span>TP: {sig.takeProfit}</span>
                    <span>{format(new Date(sig.createdAt), "MMM d, HH:mm")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBlastId(sig.id)}
                    className="text-green-500 hover:text-green-400 hover:bg-green-500/10"
                    title="Send WhatsApp blast"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                  {sig.status !== "CLOSED" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCloseSignal(sig); setClosePips(""); }}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent"
                      title="Close signal"
                    >
                      <CheckSquare className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(sig.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>New Trading Signal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Pair</label>
                <Input
                  placeholder="e.g. XAUUSD"
                  value={form.pair}
                  onChange={(e) => setForm({ ...form, pair: e.target.value.toUpperCase() })}
                  className="bg-background border-border"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Direction</label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as "BUY" | "SELL" })}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">📈 BUY</SelectItem>
                    <SelectItem value="SELL">📉 SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Entry Price</label>
                <Input placeholder="2350.00" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} className="bg-background border-border" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Stop Loss</label>
                <Input placeholder="2340.00" value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} className="bg-background border-border" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Take Profit</label>
                <Input placeholder="2370.00" value={form.takeProfit} onChange={(e) => setForm({ ...form, takeProfit: e.target.value })} className="bg-background border-border" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border">Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.pair || !form.entryPrice || !form.stopLoss || !form.takeProfit || createMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Signal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Signal Dialog */}
      <Dialog open={!!closeSignal} onOpenChange={() => setCloseSignal(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Close Signal — {closeSignal?.pair}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Pips Result (positive = win, negative = loss)
              </label>
              <Input
                type="number"
                placeholder="e.g. 150 or -50"
                value={closePips}
                onChange={(e) => setClosePips(e.target.value)}
                className="bg-background border-border"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCloseSignal(null)} className="border-border">Cancel</Button>
              <Button
                onClick={() => closeSignal && closeMutation.mutate({ id: closeSignal.id, pips: closePips })}
                disabled={!closePips || closeMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {closeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Close Signal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Blast Confirm */}
      <AlertDialog open={blastId !== null} onOpenChange={() => setBlastId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Send WhatsApp Blast?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send the signal to all active subscribers who have a WhatsApp number saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blastId && blastMutation.mutate(blastId)}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={blastMutation.isPending}
            >
              {blastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Blast"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Signal?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
