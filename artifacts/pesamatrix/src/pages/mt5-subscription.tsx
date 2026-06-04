import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetMt5Accounts,
  useGetMt5BillingSettings,
  useGetMyMt5Subscriptions,
  useInitiateMt5Payment,
  useGetPaymentStatus,
  getGetPaymentStatusQueryKey,
  useVerifyPayment,
  getMyMt5SubscriptionsQueryKey,
  getMt5BillingSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Cpu,
  CreditCard,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Calendar,
  Smartphone,
} from "lucide-react";

type PaymentStage = "idle" | "awaiting_stk" | "polling" | "verifying" | "success" | "failed";

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Active</Badge>;
  if (status === "EXPIRED") return <Badge variant="destructive">Expired</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function DaysRemaining({ days, status }: { days: number; status: string }) {
  if (status !== "ACTIVE") return null;
  if (days <= 3) return <span className="text-red-400 text-xs font-medium">{days}d left</span>;
  if (days <= 7) return <span className="text-yellow-400 text-xs font-medium">{days}d left</span>;
  return <span className="text-green-400 text-xs font-medium">{days}d left</span>;
}

export default function Mt5SubscriptionPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useGetMt5Accounts();
  const { data: settings, isLoading: settingsLoading } = useGetMt5BillingSettings();
  const { data: subscriptions = [], isLoading: subsLoading } = useGetMyMt5Subscriptions();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [numberOfDays, setNumberOfDays] = useState<number>(7);
  const [phoneNumber, setPhoneNumber] = useState("");

  const [stage, setStage] = useState<PaymentStage>("idle");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyTriggered = useRef(false);

  const { mutateAsync: initiatePay, isPending: payPending } = useInitiateMt5Payment();
  const verifyMutation = useVerifyPayment();

  const { data: paymentStatus, refetch: refetchStatus } = useGetPaymentStatus(
    checkoutRequestId ?? "",
    { query: { enabled: false, queryKey: getGetPaymentStatusQueryKey(checkoutRequestId ?? "") } }
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getMyMt5SubscriptionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getMt5BillingSettingsQueryKey() });
  }, [queryClient]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const triggerVerify = useCallback(async () => {
    if (!checkoutRequestId || verifyTriggered.current) return;
    verifyTriggered.current = true;
    setStage("verifying");

    try {
      const result = await verifyMutation.mutateAsync(checkoutRequestId);
      if (result.status === "COMPLETED") {
        stopPolling();
        setStage("success");
        invalidateAll();
        toast({ title: "Payment Confirmed!", description: "Your MT5 accounts are now active." });
      } else if (result.status === "FAILED") {
        stopPolling();
        setStage("failed");
        toast({ title: "Payment Failed", description: result.failureReason ?? "Transaction was not completed.", variant: "destructive" });
      } else {
        verifyTriggered.current = false;
        setStage("polling");
      }
    } catch {
      verifyTriggered.current = false;
      setStage("polling");
    }
  }, [checkoutRequestId, verifyMutation, stopPolling, invalidateAll, toast]);

  const poll = useCallback(async (count: number) => {
    if (!checkoutRequestId) return;

    // At 20 seconds trigger server-side Daraja verification
    if (count === 4 && !verifyTriggered.current) {
      void triggerVerify();
      const next = count + 1;
      setPollCount(next);
      pollTimer.current = setTimeout(() => poll(next), 5000);
      return;
    }

    if (count >= 60) {
      stopPolling();
      setStage("failed");
      toast({
        title: "Payment Timeout",
        description: "No confirmation after 5 minutes. If money was deducted, your accounts will activate automatically — check back shortly.",
        variant: "destructive",
      });
      return;
    }

    const { data } = await refetchStatus();
    if (data?.status === "COMPLETED") {
      stopPolling();
      setStage("success");
      invalidateAll();
      toast({ title: "Payment Confirmed!", description: `M-Pesa receipt: ${data.mpesaReceiptNumber ?? "confirmed"}` });
    } else if (data?.status === "FAILED" || data?.status === "CANCELLED") {
      stopPolling();
      setStage("failed");
      toast({ title: "Payment Failed", description: data.failureReason ?? "Transaction was not completed.", variant: "destructive" });
    } else {
      const next = count + 1;
      setPollCount(next);
      pollTimer.current = setTimeout(() => poll(next), 5000);
    }
  }, [checkoutRequestId, refetchStatus, stopPolling, invalidateAll, toast, triggerVerify]);

  useEffect(() => {
    if (stage === "polling" && checkoutRequestId) {
      verifyTriggered.current = false;
      poll(0);
    }
    return () => stopPolling();
  }, [stage, checkoutRequestId, poll, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setStage("idle");
    setCheckoutRequestId(null);
    setPollCount(0);
    verifyTriggered.current = false;
    verifyMutation.reset();
  }, [stopPolling, verifyMutation]);

  const activeSubAccountIds = new Set(
    subscriptions.filter((s) => s.status === "ACTIVE").map((s) => s.slaveAccountId)
  );

  const toggleAccount = (id: number) => {
    if (stage !== "idle") return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const fee = settings?.feePerAccountPerDay ?? 50;
  const minDays = settings?.minimumSubscriptionDays ?? 7;
  const totalAmount = fee * selectedIds.size * numberOfDays;
  const elapsedSeconds = pollCount * 5;
  const remainingSeconds = Math.max(0, 300 - elapsedSeconds);

  const handlePay = async () => {
    if (!selectedIds.size) { toast({ title: "Select at least one account", variant: "destructive" }); return; }
    if (!phoneNumber) { toast({ title: "Enter M-Pesa phone number", variant: "destructive" }); return; }
    if (numberOfDays < minDays) { toast({ title: `Minimum is ${minDays} days`, variant: "destructive" }); return; }

    setStage("awaiting_stk");
    try {
      const result = await initiatePay({
        phoneNumber,
        slaveAccountIds: Array.from(selectedIds),
        numberOfDays,
      });
      setCheckoutRequestId(result.checkoutRequestId);
      setStage("polling");
      setPollCount(0);
    } catch (err) {
      setStage("idle");
      const msg = err instanceof Error ? err.message : "Payment failed";
      toast({ title: "Payment error", description: msg, variant: "destructive" });
    }
  };

  const subsByAccount = new Map(subscriptions.map((s) => [s.slaveAccountId, s]));
  const isAwaitingPayment = stage === "polling" || stage === "verifying" || stage === "awaiting_stk";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-500/10">
          <Cpu className="w-6 h-6 text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MT5 Account Subscriptions</h1>
          <p className="text-muted-foreground text-sm">Activate copy-trading for your MT5 accounts</p>
        </div>
      </div>

      {accounts.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
            <p className="text-muted-foreground">No MT5 accounts connected yet.</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/mt5")}>
              Connect MT5 Account
            </Button>
          </CardContent>
        </Card>
      )}

      {accounts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Current Status</CardTitle>
                <CardDescription>Subscription status for each connected account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {subsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : (
                  accounts.map((account) => {
                    const sub = subsByAccount.get(account.id);
                    return (
                      <div key={account.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                        <div>
                          <p className="text-sm font-medium">{account.mt5Login}</p>
                          <p className="text-xs text-muted-foreground">{account.brokerServer}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {sub ? (
                            <>
                              <StatusBadge status={sub.status} />
                              <DaysRemaining days={sub.daysRemaining} status={sub.status} />
                            </>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">No subscription</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {settingsLoading ? null : (
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="pt-4 pb-3 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Pricing</p>
                  <p className="text-2xl font-bold text-green-400">KES {fee.toFixed(0)} <span className="text-base font-normal text-muted-foreground">/ account / day</span></p>
                  <p className="text-xs text-muted-foreground">Minimum {minDays} days per subscription</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-green-500" />
                Subscribe via M-Pesa
              </CardTitle>
              <CardDescription>Select accounts and pay via STK push</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* ── Payment waiting overlay ───────────────────────────── */}
              {stage === "polling" && (
                <div className="text-center space-y-4 py-4">
                  <div className="relative mx-auto w-14 h-14">
                    <div className="w-14 h-14 rounded-full border-4 border-green-500/20 border-t-green-500 animate-spin" />
                    <Smartphone className="w-5 h-5 text-green-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-200 font-semibold">Check Your Phone</p>
                    <p className="text-slate-400 text-sm">Enter your M-Pesa PIN on <span className="text-green-400 font-mono">{phoneNumber}</span> to complete.</p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    Waiting for confirmation… ({remainingSeconds}s)
                  </div>
                  <Button
                    className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold"
                    onClick={() => { verifyTriggered.current = false; void triggerVerify(); }}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Checking…</>
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-2" /> I've Already Paid — Verify Now</>
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset} className="text-slate-500 hover:text-slate-300 hover:bg-slate-800 w-full">
                    Cancel
                  </Button>
                </div>
              )}

              {stage === "verifying" && (
                <div className="text-center space-y-4 py-4">
                  <div className="relative mx-auto w-14 h-14">
                    <div className="w-14 h-14 rounded-full border-4 border-yellow-500/20 border-t-yellow-500 animate-spin" />
                    <RefreshCw className="w-5 h-5 text-yellow-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-200 font-semibold">Verifying with Safaricom…</p>
                    <p className="text-slate-400 text-sm">Checking payment status directly. This only takes a moment.</p>
                  </div>
                </div>
              )}

              {stage === "success" && (
                <div className="text-center space-y-4 py-4">
                  <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-slate-50 font-bold text-lg">Payment Confirmed!</p>
                    {paymentStatus?.mpesaReceiptNumber && (
                      <p className="text-slate-400 text-sm">Receipt: <span className="font-mono text-green-400">{paymentStatus.mpesaReceiptNumber}</span></p>
                    )}
                    <p className="text-slate-400 text-sm">Your selected MT5 accounts are now active.</p>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-500 text-white w-full" onClick={reset}>
                    Done
                  </Button>
                </div>
              )}

              {stage === "failed" && (
                <div className="text-center space-y-4 py-4">
                  <XCircle className="w-14 h-14 text-red-500 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-slate-50 font-bold text-lg">Payment Failed</p>
                    <p className="text-slate-400 text-sm">
                      {paymentStatus?.failureReason ?? "The transaction was not completed."}
                    </p>
                  </div>
                  <Button className="bg-slate-700 hover:bg-slate-600 text-white w-full" onClick={reset}>
                    Try Again
                  </Button>
                </div>
              )}

              {/* ── Form (hidden while payment is in progress) ────────── */}
              {!isAwaitingPayment && stage !== "success" && stage !== "failed" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Select accounts to subscribe</Label>
                    <div className="space-y-2">
                      {accounts.map((account) => (
                        <label
                          key={account.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <Checkbox
                            checked={selectedIds.has(account.id)}
                            onCheckedChange={() => toggleAccount(account.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{account.mt5Login}</p>
                            <p className="text-xs text-muted-foreground">{account.brokerServer}</p>
                          </div>
                          {activeSubAccountIds.has(account.id) && (
                            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">Active</Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="days" className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" /> Subscription Days
                    </Label>
                    <div className="flex gap-2">
                      {[7, 14, 30].map((d) => (
                        <Button
                          key={d}
                          variant={numberOfDays === d ? "default" : "outline"}
                          size="sm"
                          onClick={() => setNumberOfDays(d)}
                          className={numberOfDays === d ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                          {d}d
                        </Button>
                      ))}
                      <Input
                        id="days"
                        type="number"
                        min={minDays}
                        value={numberOfDays}
                        onChange={(e) => setNumberOfDays(Math.max(minDays, parseInt(e.target.value) || minDays))}
                        className="w-20 h-8 text-sm"
                      />
                    </div>
                    {numberOfDays < minDays && (
                      <p className="text-xs text-red-400">Minimum {minDays} days</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">M-Pesa Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="07XXXXXXXX or 254XXXXXXXXX"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                  </div>

                  {selectedIds.size > 0 && (
                    <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{selectedIds.size} account(s) × {numberOfDays} days × KES {fee}</span>
                        <span className="font-bold text-green-400">KES {totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={payPending || stage === "awaiting_stk" || !selectedIds.size || numberOfDays < minDays}
                    onClick={handlePay}
                  >
                    {payPending || stage === "awaiting_stk" ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending STK Push…</>
                    ) : (
                      <><CreditCard className="w-4 h-4 mr-2" /> Pay KES {totalAmount.toLocaleString()} via M-Pesa</>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {subscriptions.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-500" />
              Subscription History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Account</th>
                    <th className="text-left pb-2 font-medium">Period</th>
                    <th className="text-left pb-2 font-medium">Amount</th>
                    <th className="text-left pb-2 font-medium">Expires</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td className="py-2.5">
                        <p className="font-medium">{sub.mt5Login}</p>
                        <p className="text-xs text-muted-foreground">{sub.brokerServer}</p>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{sub.numberOfDays} days</td>
                      <td className="py-2.5 text-muted-foreground">KES {sub.amount.toLocaleString()}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : "—"}
                        {sub.status === "ACTIVE" && <DaysRemaining days={sub.daysRemaining} status={sub.status} />}
                      </td>
                      <td className="py-2.5"><StatusBadge status={sub.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
