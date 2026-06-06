import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyAdvertisements,
  useCreateAdvertisement,
  useGetAdvertisementSettings,
  useInitiateAdPayment,
  useGetPaymentStatus,
  useVerifyPayment,
  useGetMyAdPayments,
  getGetPaymentStatusQueryKey,
  getMyAdsQueryKey,
  type AdStatus,
  type AdMediaType,
  type Advertisement,
  type AdPayment,
  type AdPaymentResponse,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  ImageIcon,
  Video,
  Link2,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  TimerOff,
  Upload,
  ExternalLink,
  Smartphone,
  Phone,
  ArrowLeft,
  BadgeCheck,
  AlertCircle,
  Receipt,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
} from "lucide-react";

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AdStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "Pending Review", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
  APPROVED: { label: "Active", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED: { label: "Rejected", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  PAUSED: { label: "Paused", color: "text-slate-400 bg-slate-500/10 border-slate-500/20", icon: <PauseCircle className="w-3 h-3" /> },
  EXPIRED: { label: "Expired", color: "text-slate-500 bg-slate-800/50 border-slate-700", icon: <TimerOff className="w-3 h-3" /> },
};

const MEDIA_TYPE_OPTIONS: { value: AdMediaType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "IMAGE", label: "Image", icon: <ImageIcon className="w-4 h-4" />, desc: "Upload a banner or promotional image" },
  { value: "VIDEO", label: "Video", icon: <Video className="w-4 h-4" />, desc: "Upload an MP4, MOV, or WEBM video" },
  { value: "LINK", label: "Link Only", icon: <Link2 className="w-4 h-4" />, desc: "Text ad with external link, no media" },
];

function StatusBadge({ status }: { status: AdStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── STK Polling step ──────────────────────────────────────────────────────────

type PayStage = "idle" | "awaiting_stk" | "polling" | "verifying" | "success" | "failed";

function PaymentStep({
  ad,
  onSuccess,
  onBack,
  initialPhone = "",
}: {
  ad: Advertisement;
  onSuccess: () => void;
  onBack: () => void;
  initialPhone?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [phone, setPhone] = useState(initialPhone);
  const [stage, setStage] = useState<PayStage>("idle");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyTriggered = useRef(false);

  const payMutation = useInitiateAdPayment();
  const verifyMutation = useVerifyPayment();
  const { refetch: refetchStatus } = useGetPaymentStatus(
    checkoutRequestId ?? "",
    { query: { enabled: false, queryKey: getGetPaymentStatusQueryKey(checkoutRequestId ?? "") } }
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
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
        queryClient.invalidateQueries({ queryKey: getMyAdsQueryKey() });
        toast({
          title: "Payment confirmed!",
          description: result.mpesaReceiptNumber ? `M-Pesa receipt: ${result.mpesaReceiptNumber}` : "Payment verified.",
        });
        setTimeout(onSuccess, 2000);
      } else {
        setStage("polling");
        verifyTriggered.current = false;
        toast({ title: "Not confirmed yet", description: "Payment not yet confirmed by Safaricom. Keep waiting.", variant: "destructive" });
      }
    } catch {
      setStage("polling");
      verifyTriggered.current = false;
    }
  }, [checkoutRequestId, verifyMutation, stopPolling, queryClient, toast, onSuccess]);

  const poll = useCallback(async (count: number) => {
    if (!checkoutRequestId) return;
    if (count >= 24) {
      stopPolling();
      setStage("failed");
      toast({ title: "Payment Timeout", description: "No response received. Please try again.", variant: "destructive" });
      return;
    }
    // At 20 seconds trigger server-side Daraja verification
    if (count === 4 && !verifyTriggered.current) {
      void triggerVerify();
      return;
    }
    const { data } = await refetchStatus();
    if (data?.status === "COMPLETED") {
      stopPolling();
      setStage("success");
      queryClient.invalidateQueries({ queryKey: getMyAdsQueryKey() });
      toast({ title: "Payment confirmed!", description: data.mpesaReceiptNumber ? `M-Pesa receipt: ${data.mpesaReceiptNumber}` : "Payment verified." });
      setTimeout(onSuccess, 2000);
    } else if (data?.status === "FAILED" || data?.status === "CANCELLED") {
      stopPolling();
      setStage("failed");
      toast({ title: "Payment failed", description: data.failureReason ?? "Transaction not completed.", variant: "destructive" });
    } else {
      const next = count + 1;
      setPollCount(next);
      pollTimer.current = setTimeout(() => poll(next), 5000);
    }
  }, [checkoutRequestId, refetchStatus, stopPolling, queryClient, toast, onSuccess, triggerVerify]);

  useEffect(() => {
    if (stage === "polling" && checkoutRequestId) {
      verifyTriggered.current = false;
      poll(0);
    }
    return () => stopPolling();
  }, [stage, checkoutRequestId, poll, stopPolling]);

  const handlePay = () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      toast({ title: "Phone required", description: "Enter your Safaricom M-Pesa number.", variant: "destructive" });
      return;
    }
    setStage("awaiting_stk");
    payMutation.mutate(
      { id: ad.id, phoneNumber: trimmed },
      {
        onSuccess: (data: AdPaymentResponse) => {
          setCheckoutRequestId(data.checkoutRequestId);
          setStage("polling");
          setPollCount(0);
        },
        onError: (err: unknown) => {
          setStage("idle");
          const msg = (err as { data?: { error?: string } })?.data?.error
            ?? (err instanceof Error ? err.message : "STK Push failed. Try again.");
          toast({ title: "Payment error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleReset = () => {
    stopPolling();
    setStage("idle");
    setCheckoutRequestId(null);
    setPollCount(0);
    verifyTriggered.current = false;
    payMutation.reset();
    verifyMutation.reset();
  };

  const totalAmount = parseFloat(ad.totalAmount);

  return (
    <Card className="bg-slate-900 border-slate-800 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <Smartphone className="w-40 h-40 text-green-500" />
      </div>

      <CardHeader className="relative z-10">
        <div className="flex items-center gap-3">
          {stage === "idle" && (
            <button onClick={onBack} className="text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <CardTitle className="text-slate-100">Pay via M-Pesa</CardTitle>
            <CardDescription className="text-slate-400">
              STK Push to activate "{ad.title}"
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 space-y-5">
        {/* Amount summary */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Total to Pay</p>
            <p className="text-2xl font-bold text-green-400">KES {totalAmount.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{ad.totalDays} days · Lipa Na M-Pesa</p>
          </div>
          <Smartphone className="w-8 h-8 text-green-500 opacity-60" />
        </div>

        {/* Stages */}
        {stage === "success" ? (
          <div className="text-center py-8 space-y-3">
            <BadgeCheck className="w-14 h-14 text-green-500 mx-auto" />
            <p className="text-lg font-semibold text-slate-100">Payment Confirmed!</p>
            <p className="text-slate-400 text-sm">Your ad is now pending admin review.</p>
          </div>

        ) : stage === "failed" ? (
          <div className="text-center py-6 space-y-4">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-slate-300 font-medium">Payment failed or cancelled</p>
            <Button onClick={handleReset} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Try Again
            </Button>
          </div>

        ) : stage === "verifying" ? (
          <div className="text-center py-8 space-y-4">
            <div className="relative mx-auto w-16 h-16">
              <div className="w-16 h-16 rounded-full border-4 border-yellow-500/20 border-t-yellow-500 animate-spin" />
              <RefreshCw className="w-6 h-6 text-yellow-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-1">
              <p className="text-slate-200 font-semibold">Verifying with Safaricom…</p>
              <p className="text-slate-400 text-sm">Checking payment status directly with Safaricom.</p>
            </div>
          </div>

        ) : stage === "polling" || stage === "awaiting_stk" ? (
          <div className="text-center py-8 space-y-4">
            <div className="relative mx-auto w-16 h-16">
              <div className="w-16 h-16 rounded-full border-4 border-green-500/20 border-t-green-500 animate-spin" />
              <Smartphone className="w-6 h-6 text-green-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-1.5">
              <p className="text-slate-100 font-semibold">
                {stage === "awaiting_stk" ? "Sending STK Push…" : "Check Your Phone"}
              </p>
              <p className="text-slate-400 text-sm">
                {stage === "awaiting_stk"
                  ? "Connecting to Safaricom…"
                  : `An M-Pesa prompt has been sent to `}
                {stage === "polling" && <span className="text-green-400 font-mono">{phone}</span>}
              </p>
              {stage === "polling" && (
                <p className="text-slate-400 text-sm">Enter your M-Pesa PIN to complete the payment.</p>
              )}
            </div>
            {stage === "polling" && (
              <>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  Waiting for confirmation… ({pollCount * 5}s)
                </div>
                <Button
                  className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold"
                  onClick={() => { verifyTriggered.current = false; void triggerVerify(); }}
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Checking…</>
                    : <><RefreshCw className="w-4 h-4 mr-2" /> I've Already Paid — Verify Now</>
                  }
                </Button>
                <Button variant="ghost" size="sm" onClick={handleReset}
                  className="text-slate-500 hover:text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
              </>
            )}
          </div>

        ) : (
          /* idle — phone input + instructions */
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> M-Pesa Phone Number
              </Label>
              <Input
                type="tel"
                placeholder="07XXXXXXXX or 2547XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePay()}
                className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-600 focus:border-green-500 focus-visible:ring-green-500/30"
              />
              <p className="text-xs text-slate-500">The Safaricom number that will receive the payment prompt.</p>
            </div>

            {/* Payment Instructions */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">How to Pay</p>
              </div>
              <ol className="space-y-2">
                {[
                  "Enter your Safaricom M-Pesa number above.",
                  `Click "Pay KES ${totalAmount.toLocaleString()} via M-Pesa" — an STK Push prompt will appear on your phone.`,
                  "Open the prompt and enter your M-Pesa PIN to approve the transaction.",
                  "Once confirmed, your ad will be submitted for admin review and go live shortly.",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-slate-400">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-green-500/15 text-green-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-slate-600 mt-3">
                If the prompt doesn't arrive within 30 seconds, tap "I've Already Paid — Verify Now" after clicking Pay.
              </p>
            </div>

            <Button
              onClick={handlePay}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
              disabled={!phone.trim()}
            >
              <Smartphone className="w-4 h-4 mr-2" />
              Pay KES {totalAmount.toLocaleString()} via M-Pesa
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Payment history ───────────────────────────────────────────────────────────

const PAY_STATUS_CONFIG = {
  COMPLETED: { label: "Paid", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  PENDING: { label: "Pending", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
  FAILED: { label: "Failed", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  CANCELLED: { label: "Cancelled", color: "text-slate-400 bg-slate-500/10 border-slate-500/20", icon: <XCircle className="w-3 h-3" /> },
} as const;

function PaymentRow({ payment }: { payment: AdPayment }) {
  const cfg = PAY_STATUS_CONFIG[payment.status] ?? PAY_STATUS_CONFIG.PENDING;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-800 last:border-0">
      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Receipt className="w-4 h-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-medium text-slate-200 truncate">{payment.adTitle}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(payment.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {payment.phoneNumber && ` · ${payment.phoneNumber}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-semibold text-slate-100">KES {parseFloat(payment.amount).toLocaleString()}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
        </div>
        {payment.mpesaReceiptNumber && (
          <div className="flex items-center gap-1.5 mt-1">
            <BadgeCheck className="w-3 h-3 text-green-500 flex-shrink-0" />
            <span className="text-xs font-mono text-green-400">{payment.mpesaReceiptNumber}</span>
          </div>
        )}
        {payment.failureReason && (
          <p className="text-xs text-red-400 mt-1">{payment.failureReason}</p>
        )}
      </div>
    </div>
  );
}

function PaymentHistorySection() {
  const { data: payments = [], isLoading } = useGetMyAdPayments();
  const [expanded, setExpanded] = useState(false);

  if (isLoading) return null;
  if (payments.length === 0) return null;

  const visible = expanded ? payments : payments.slice(0, 3);
  const total = payments.filter((p) => p.status === "COMPLETED").reduce((sum, p) => sum + parseFloat(p.amount), 0);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-400" />
            <CardTitle className="text-lg text-slate-100">Payment History</CardTitle>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{payments.length}</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Total paid</p>
            <p className="text-sm font-bold text-green-400">KES {total.toLocaleString()}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-slate-800">
          {visible.map((p) => <PaymentRow key={p.id} payment={p} />)}
        </div>
        {payments.length > 3 && (
          <button
            onClick={() => setExpanded((x) => !x)}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1.5"
          >
            {expanded
              ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
              : <><ChevronDown className="w-3.5 h-3.5" /> Show {payments.length - 3} more</>
            }
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ad card in My Ads list ────────────────────────────────────────────────────

function AdListCard({ ad, onPayNow }: { ad: Advertisement; onPayNow: (ad: Advertisement) => void }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-900 border border-slate-800">
      {ad.mediaUrl && ad.mediaType === "IMAGE" && (
        <img src={ad.mediaUrl} alt={ad.title} className="w-20 h-14 object-cover rounded flex-shrink-0" />
      )}
      {ad.mediaUrl && ad.mediaType === "VIDEO" && (
        <video src={ad.mediaUrl} className="w-20 h-14 object-cover rounded flex-shrink-0" muted />
      )}
      {ad.mediaType === "LINK" && (
        <div className="w-20 h-14 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
          <Link2 className="w-6 h-6 text-slate-500" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-100">{ad.title}</p>
            {ad.description && <p className="text-xs text-slate-500 mt-0.5">{ad.description}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!ad.isPaid ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-orange-400 bg-orange-500/10 border-orange-500/20">
                <AlertCircle className="w-3 h-3" /> Awaiting Payment
              </span>
            ) : (
              <StatusBadge status={ad.status} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
          <span>{ad.totalDays} days · KES {parseFloat(ad.totalAmount).toLocaleString()}</span>
          {ad.startDate && <span>Started {new Date(ad.startDate).toLocaleDateString()}</span>}
          {ad.endDate && <span>Ends {new Date(ad.endDate).toLocaleDateString()}</span>}
          {ad.externalLink && (
            <a href={ad.externalLink} target="_blank" rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 flex items-center gap-0.5">
              <ExternalLink className="w-3 h-3" /> Visit Link
            </a>
          )}
        </div>
        {!ad.isPaid && (
          <Button
            size="sm"
            onClick={() => onPayNow(ad)}
            className="mt-3 bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3"
          >
            <Smartphone className="w-3 h-3 mr-1.5" /> Pay Now via M-Pesa
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = "list" | "form" | "pay";

export default function Advertisements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useGetAdvertisementSettings();
  const { data: myAds = [], isLoading } = useGetMyAdvertisements();
  const createMutation = useCreateAdvertisement();

  const [step, setStep] = useState<Step>("list");
  const [pendingPayAd, setPendingPayAd] = useState<Advertisement | null>(null);
  const [pendingPhone, setPendingPhone] = useState("");

  // Form state
  const [mediaType, setMediaType] = useState<AdMediaType>("IMAGE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [totalDays, setTotalDays] = useState(7);
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const feePerDay = parseFloat(settings?.feePerDay ?? "100");
  const minDays = settings?.minDays ?? 1;
  const maxDays = settings?.maxDays ?? 90;
  const totalCost = feePerDay * totalDays;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setExternalLink(""); setTotalDays(7);
    setPhone(""); setFile(null); setPreview(null); setMediaType("IMAGE");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if ((mediaType === "IMAGE" || mediaType === "VIDEO") && !file) {
      toast({ title: "Please select a file", variant: "destructive" }); return;
    }
    if (mediaType === "LINK" && !externalLink.trim()) {
      toast({ title: "External link is required", variant: "destructive" }); return;
    }

    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("mediaType", mediaType);
    fd.append("externalLink", externalLink.trim());
    fd.append("totalDays", String(totalDays));
    if (file) fd.append("file", file);

    createMutation.mutate({ data: fd }, {
      onSuccess: (newAd) => {
        queryClient.invalidateQueries({ queryKey: getMyAdsQueryKey() });
        setPendingPhone(phone);
        resetForm();
        setPendingPayAd(newAd);
        setStep("pay");
      },
      onError: (err) => toast({ title: (err as Error).message, variant: "destructive" }),
    });
  };

  const handlePayNow = (ad: Advertisement) => {
    setPendingPayAd(ad);
    setStep("pay");
  };

  const handlePaySuccess = () => {
    queryClient.invalidateQueries({ queryKey: getMyAdsQueryKey() });
    setPendingPayAd(null);
    setStep("list");
  };

  const activeAds = myAds.filter((a) => a.isPaid && a.status === "APPROVED");
  const pendingAds = myAds.filter((a) => a.isPaid && a.status === "PENDING");
  const unpaidAds = myAds.filter((a) => !a.isPaid);
  const closedAds = myAds.filter((a) => a.isPaid && (a.status === "EXPIRED" || a.status === "REJECTED" || a.status === "PAUSED"));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Advertise With Us</h2>
          <p className="text-slate-400 mt-1">Reach traders and investors on PESAMATRIX SIGNAL.</p>
        </div>
        {step === "list" && (
          <Button onClick={() => setStep("form")} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Create Advertisement
          </Button>
        )}
        {(step === "form" || step === "pay") && step !== "pay" && (
          <Button variant="ghost" onClick={() => { setStep("list"); resetForm(); }} className="text-slate-400">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        )}
      </div>

      {/* Pricing info */}
      {settings && step === "list" && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Fee Per Day", value: `KES ${feePerDay.toLocaleString()}` },
            { label: "Min Days", value: String(minDays) },
            { label: "Max Days", value: String(maxDays) },
          ].map(({ label, value }) => (
            <Card key={label} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-slate-100">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Step: Pay */}
      {step === "pay" && pendingPayAd && (
        <PaymentStep
          ad={pendingPayAd}
          onSuccess={handlePaySuccess}
          onBack={() => { setPendingPayAd(null); setPendingPhone(""); setStep("list"); }}
          initialPhone={pendingPhone}
        />
      )}

      {/* Step: Create Form */}
      {step === "form" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-slate-100">New Advertisement</CardTitle>
            <CardDescription className="text-slate-500">
              After submitting, you'll be prompted to pay via M-Pesa. Your ad goes live once approved by our team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Media type */}
              <div>
                <Label className="text-slate-300 mb-3 block">Advertisement Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {MEDIA_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setMediaType(opt.value); setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        mediaType === opt.value
                          ? "border-green-500 bg-green-500/10 text-green-400"
                          : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 font-medium text-sm">{opt.icon} {opt.label}</div>
                      <p className="text-xs text-slate-500">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ad-title" className="text-slate-300">Title *</Label>
                  <Input id="ad-title" value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Best Forex Broker 2024" className="bg-slate-800 border-slate-700 text-slate-100" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ad-link" className="text-slate-300">External Link {mediaType === "LINK" ? "*" : "(optional)"}</Label>
                  <Input id="ad-link" value={externalLink} onChange={(e) => setExternalLink(e.target.value)}
                    placeholder="https://example.com" className="bg-slate-800 border-slate-700 text-slate-100" type="url" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ad-desc" className="text-slate-300">Description (optional)</Label>
                <Input id="ad-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short tagline" className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>

              {(mediaType === "IMAGE" || mediaType === "VIDEO") && (
                <div className="space-y-2">
                  <Label className="text-slate-300">{mediaType === "IMAGE" ? "Upload Image *" : "Upload Video *"}</Label>
                  <div onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-green-500/50 hover:bg-green-500/5 transition-all">
                    {preview ? (
                      mediaType === "IMAGE"
                        ? <img src={preview} alt="preview" className="max-h-32 mx-auto rounded object-contain" />
                        : <video src={preview} className="max-h-32 mx-auto rounded" controls />
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Click to upload {mediaType === "IMAGE" ? "JPG, PNG, WEBP, GIF" : "MP4, MOV, WEBM"}</p>
                        <p className="text-xs text-slate-600 mt-1">Max 100MB</p>
                      </>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept={mediaType === "IMAGE" ? "image/*" : "video/*"}
                    onChange={handleFileChange} className="hidden" />
                  {file && <p className="text-xs text-slate-500">{file.name}</p>}
                </div>
              )}

              {/* Days & cost */}
              <div className="space-y-2">
                <Label htmlFor="ad-days" className="text-slate-300">Number of Days * ({minDays}–{maxDays})</Label>
                <div className="flex items-center gap-4">
                  <Input id="ad-days" type="number" min={minDays} max={maxDays} value={totalDays}
                    onChange={(e) => setTotalDays(Math.min(maxDays, Math.max(minDays, parseInt(e.target.value) || minDays)))}
                    className="bg-slate-800 border-slate-700 text-slate-100 w-32" />
                  <div className="flex-1 bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-2">
                    <p className="text-xs text-slate-500 mb-0.5">Total Cost</p>
                    <p className="text-xl font-bold text-green-400">KES {totalCost.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">KES {feePerDay.toLocaleString()} × {totalDays} days = KES {totalCost.toLocaleString()}</p>
              </div>

              {/* M-Pesa phone number */}
              <div className="space-y-2">
                <Label htmlFor="ad-phone" className="text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Safaricom M-Pesa Number *
                </Label>
                <Input
                  id="ad-phone"
                  type="tel"
                  placeholder="07XXXXXXXX or 2547XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-green-500 focus-visible:ring-green-500/30"
                  required
                />
                <p className="text-xs text-slate-500">The Safaricom number that will receive the M-Pesa payment prompt.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
                  Continue to Payment
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setStep("list"); resetForm(); }} className="text-slate-400">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step: My Ads list */}
      {step === "list" && (
        isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-green-500" /></div>
        ) : myAds.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="py-16 text-center">
              <ImageIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-300 font-medium">No advertisements yet</p>
              <p className="text-slate-500 text-sm mt-1">Create your first ad to start reaching PESAMATRIX users.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {([
              { label: "Awaiting Payment", items: unpaidAds, warn: true },
              { label: "Active Ads", items: activeAds, warn: false },
              { label: "Pending Review", items: pendingAds, warn: false },
              { label: "Paused / Expired / Rejected", items: closedAds, warn: false },
            ] as const).filter(({ items }) => items.length > 0).map(({ label, items, warn }) => (
              <Card key={label} className={`bg-slate-900/50 border-slate-800 ${warn ? "border-orange-500/30" : ""}`}>
                <CardHeader className="pb-3">
                  <CardTitle className={`text-lg ${warn ? "text-orange-400" : "text-slate-100"}`}>{label}</CardTitle>
                  {warn && (
                    <CardDescription className="text-orange-400/70 text-xs">
                      Complete payment to submit for admin review.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {items.map((ad) => (
                      <AdListCard key={ad.id} ad={ad} onPayNow={handlePayNow} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )
      )}

      {/* Payment history — always visible on list step */}
      {step === "list" && <PaymentHistorySection />}
    </div>
  );
}
