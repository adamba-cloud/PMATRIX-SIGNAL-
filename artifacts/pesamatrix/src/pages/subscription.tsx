import { useState, useEffect, useRef, useCallback } from "react";
import {
  useGetMySubscription, getGetMySubscriptionQueryKey,
  useGetConfig, getGetConfigQueryKey,
  useGetMyPayments, getGetMyPaymentsQueryKey,
  useInitiateStkPush, useGetPaymentStatus, getGetPaymentStatusQueryKey,
  getListSignalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Loader2, ShieldCheck, Smartphone, CheckCircle2, XCircle, Clock, CalendarDays, Banknote, Phone } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type PaymentStage = "idle" | "awaiting_stk" | "polling" | "success" | "failed";

export default function Subscription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: subscription, isLoading: isLoadingSub } = useGetMySubscription({ query: { queryKey: getGetMySubscriptionQueryKey() } });
  const { data: config, isLoading: isLoadingConfig } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });
  const stkMutation = useInitiateStkPush();

  const [days, setDays] = useState<number>(30);
  const [phone, setPhone] = useState<string>("");
  const [stage, setStage] = useState<PaymentStage>("idle");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: paymentStatus, refetch: refetchStatus } = useGetPaymentStatus(
    checkoutRequestId ?? "",
    { query: { enabled: false, queryKey: getGetPaymentStatusQueryKey(checkoutRequestId ?? "") } }
  );

  const minDays = config?.minDays ?? 7;
  const feePerDay = config?.feePerDay ?? 150;
  const selectedDays = Math.max(days, minDays);
  const totalAmount = selectedDays * feePerDay;
  const hasActiveSub = subscription?.status === "ACTIVE";

  const daysRemaining = subscription?.endDate
    ? Math.max(0, Math.ceil((new Date(subscription.endDate).getTime() - Date.now()) / 86400000))
    : null;

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const poll = useCallback(async (count: number) => {
    if (!checkoutRequestId) return;
    if (count >= 60) {
      stopPolling();
      setStage("failed");
      toast({ title: "Payment Timeout", description: "No response received after 5 minutes. Check your M-Pesa messages — if deducted, your subscription will activate automatically within minutes.", variant: "destructive" });
      return;
    }
    const { data } = await refetchStatus();
    if (data?.status === "COMPLETED") {
      stopPolling();
      setStage("success");
      queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMyPaymentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSignalsQueryKey() });
      toast({ title: "Payment Successful!", description: `M-Pesa receipt: ${data.mpesaReceiptNumber}` });
    } else if (data?.status === "FAILED" || data?.status === "CANCELLED") {
      stopPolling();
      setStage("failed");
      toast({ title: "Payment Failed", description: data.failureReason ?? "Transaction was not completed.", variant: "destructive" });
    } else {
      const next = count + 1;
      setPollCount(next);
      pollTimer.current = setTimeout(() => poll(next), 5000);
    }
  }, [checkoutRequestId, refetchStatus, stopPolling, queryClient, toast]);

  useEffect(() => {
    if (stage === "polling" && checkoutRequestId) {
      poll(0);
    }
    return () => stopPolling();
  }, [stage, checkoutRequestId, poll, stopPolling]);

  useEffect(() => {
    if (minDays > days) setDays(minDays);
  }, [minDays, days]);

  const handlePay = () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      toast({ title: "Phone Required", description: "Enter your Safaricom M-Pesa number.", variant: "destructive" });
      return;
    }
    setStage("awaiting_stk");
    stkMutation.mutate(
      { data: { phoneNumber: trimmedPhone, daysSelected: selectedDays } },
      {
        onSuccess: (data) => {
          setCheckoutRequestId(data.checkoutRequestId);
          setStage("polling");
          setPollCount(0);
        },
        onError: (err: unknown) => {
          setStage("idle");
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "STK Push failed. Try again.";
          toast({ title: "Payment Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const reset = () => {
    stopPolling();
    setStage("idle");
    setCheckoutRequestId(null);
    setPollCount(0);
    stkMutation.reset();
  };

  if (isLoadingSub || isLoadingConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Subscription</h2>
        <p className="text-slate-400">Manage your trading terminal access via M-Pesa.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current Status */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-50 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-500" />
              Subscription Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscription && subscription.id !== 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Status</span>
                  <Badge variant="outline" className={
                    subscription.status === "ACTIVE" ? "border-green-500 text-green-400 bg-green-500/10" :
                    subscription.status === "PENDING" ? "border-yellow-500 text-yellow-400 bg-yellow-500/10" :
                    subscription.status === "EXPIRED" ? "border-red-500 text-red-400 bg-red-500/10" :
                    "border-slate-600 text-slate-400"
                  }>
                    {subscription.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Duration</span>
                  <span className="text-slate-200 font-medium">{subscription.daysSelected} days</span>
                </div>

                {subscription.startDate && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Started</span>
                    <span className="text-slate-200">{format(new Date(subscription.startDate), "MMM dd, yyyy")}</span>
                  </div>
                )}

                {subscription.endDate && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Expires</span>
                    <span className={`font-semibold ${daysRemaining !== null && daysRemaining <= 3 ? "text-red-400" : "text-green-400"}`}>
                      {format(new Date(subscription.endDate), "MMM dd, yyyy")}
                    </span>
                  </div>
                )}

                {daysRemaining !== null && subscription.status === "ACTIVE" && (
                  <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-green-400 font-semibold text-center text-lg">{daysRemaining} days remaining</p>
                    <p className="text-slate-400 text-center text-xs mt-1">
                      {subscription.endDate && formatDistanceToNow(new Date(subscription.endDate), { addSuffix: true })}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400 flex items-center gap-1.5"><Banknote className="w-4 h-4" /> Amount Paid</span>
                  <span className="text-slate-200 font-semibold">KES {subscription.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 space-y-3 text-slate-400">
                <ShieldCheck className="w-12 h-12 mx-auto text-slate-700" />
                <p>No active subscription.</p>
                <p className="text-sm">Subscribe to access trading signals.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Card */}
        <Card className="bg-slate-900 border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Smartphone className="w-36 h-36 text-green-500" />
          </div>

          <CardHeader className="relative z-10">
            <CardTitle className="text-slate-50">Pay via M-Pesa</CardTitle>
            <CardDescription className="text-slate-400">STK Push — Safaricom Lipa Na M-Pesa</CardDescription>
          </CardHeader>

          <CardContent className="relative z-10 space-y-6">
            {stage === "idle" || stage === "awaiting_stk" ? (
              <>
                {/* Phone */}
                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> M-Pesa Phone Number
                  </Label>
                  <Input
                    type="tel"
                    placeholder="07XXXXXXXX or 2547XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-600 focus:border-green-500 focus-visible:ring-green-500/30"
                    disabled={stage === "awaiting_stk"}
                  />
                  <p className="text-xs text-slate-500">The number that will receive the STK Push prompt.</p>
                </div>

                {/* Days slider */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <Label className="text-slate-300">Subscription Duration</Label>
                    <span className="text-2xl font-bold text-white">{selectedDays} days</span>
                  </div>
                  <Slider
                    value={[Math.max(days, minDays)]}
                    min={minDays}
                    max={365}
                    step={1}
                    onValueChange={(v) => setDays(v[0])}
                    disabled={stage === "awaiting_stk"}
                  />
                  <p className="text-xs text-slate-500">Minimum {minDays} day{minDays !== 1 ? "s" : ""} required</p>
                </div>

                {/* Summary */}
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Daily Rate</span>
                    <span className="text-slate-200">KES {feePerDay}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Duration</span>
                    <span className="text-slate-200">{selectedDays} days</span>
                  </div>
                  <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center">
                    <span className="font-semibold text-slate-200">Total</span>
                    <span className="text-2xl font-bold text-green-400">KES {totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </>
            ) : stage === "polling" ? (
              <div className="text-center space-y-5 py-6">
                <div className="relative mx-auto w-16 h-16">
                  <div className="w-16 h-16 rounded-full border-4 border-green-500/20 border-t-green-500 animate-spin" />
                  <Smartphone className="w-6 h-6 text-green-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="space-y-2">
                  <p className="text-slate-200 font-semibold text-lg">Check Your Phone</p>
                  <p className="text-slate-400 text-sm">An M-Pesa STK Push prompt has been sent to <span className="text-green-400 font-mono">{phone}</span>.</p>
                  <p className="text-slate-400 text-sm">Enter your M-Pesa PIN to complete the payment.</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  Waiting for confirmation… ({Math.max(0, 300 - pollCount * 5)}s)
                </div>
                <Button variant="ghost" size="sm" onClick={reset} className="text-slate-500 hover:text-slate-300 hover:bg-slate-800 mt-2">
                  Cancel
                </Button>
              </div>
            ) : stage === "success" ? (
              <div className="text-center space-y-4 py-6">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <p className="text-slate-50 font-bold text-xl">Payment Successful!</p>
                {paymentStatus?.mpesaReceiptNumber && (
                  <p className="text-slate-400 text-sm">Receipt: <span className="font-mono text-green-400">{paymentStatus.mpesaReceiptNumber}</span></p>
                )}
                <p className="text-slate-400 text-sm">Your subscription is now active. You have full access to all signals.</p>
                <Button className="bg-green-600 hover:bg-green-500 text-white" onClick={reset}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="text-center space-y-4 py-6">
                <XCircle className="w-16 h-16 text-red-500 mx-auto" />
                <p className="text-slate-50 font-bold text-xl">Payment Failed</p>
                <p className="text-slate-400 text-sm">
                  {paymentStatus?.failureReason ?? "The transaction was not completed."}
                </p>
                <Button className="bg-slate-700 hover:bg-slate-600 text-white" onClick={reset}>
                  Try Again
                </Button>
              </div>
            )}
          </CardContent>

          {(stage === "idle" || stage === "awaiting_stk") && (
            <CardFooter className="relative z-10">
              <Button
                className="w-full h-12 bg-green-600 hover:bg-green-500 text-white font-semibold text-base disabled:opacity-60"
                onClick={handlePay}
                disabled={stage === "awaiting_stk" || stkMutation.isPending || hasActiveSub}
              >
                {stage === "awaiting_stk" || stkMutation.isPending ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Sending STK Push…</>
                ) : hasActiveSub ? (
                  "Subscription Already Active"
                ) : (
                  <><Smartphone className="w-5 h-5 mr-2" /> Pay KES {totalAmount.toLocaleString()} via M-Pesa</>
                )}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
