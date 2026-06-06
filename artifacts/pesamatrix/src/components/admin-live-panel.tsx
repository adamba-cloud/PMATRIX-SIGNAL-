import { useRef, useEffect, useState, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import {
  ArrowUpCircle, ArrowDownCircle, CreditCard, UserPlus,
  ShieldCheck, ImageIcon, Video, Link2, Trash2, CheckCircle2,
  XCircle, Wifi, WifiOff, Inbox,
} from "lucide-react";
import { useAdminNotifications, type AdminNotification } from "@/hooks/use-admin-notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function useTickingTime() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
}

// ─── per-event rendering ────────────────────────────────────────────────────

function CopyTradeFanOutRow({ n }: { n: AdminNotification }) {
  const success = n.status === "SUCCESS";
  const direction = String(n.direction ?? "");
  return (
    <div className="flex items-start gap-3 w-full min-w-0">
      <div
        className={`mt-0.5 p-1.5 rounded-md shrink-0 ${
          success ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
        }`}
      >
        {direction === "BUY" ? (
          <ArrowUpCircle className="w-3.5 h-3.5" />
        ) : (
          <ArrowDownCircle className="w-3.5 h-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-100 leading-none">
            Copy-Trade Fan-Out
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] leading-none px-1.5 py-0.5 ${
              direction === "BUY"
                ? "border-green-500/50 text-green-400"
                : "border-red-500/50 text-red-400"
            }`}
          >
            {direction}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] leading-none px-1.5 py-0.5 ${
              success
                ? "border-green-500/40 text-green-400"
                : "border-red-500/40 text-red-400"
            }`}
          >
            {success ? "✓ Executed" : "✗ Failed"}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          <span className="font-medium text-slate-300">{String(n.symbol ?? "–")}</span>
          {n.volume != null && (
            <span className="ml-1.5 text-slate-500">vol {Number(n.volume).toFixed(2)}</span>
          )}
          {n.slaveMetaApiId && (
            <span className="ml-1.5 text-slate-600 truncate">
              · slave {String(n.slaveMetaApiId).slice(0, 8)}…
            </span>
          )}
          {!success && n.error && (
            <span className="ml-1.5 text-red-400/80">{String(n.error).slice(0, 60)}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function PaymentCompletedRow({ n }: { n: AdminNotification }) {
  return (
    <div className="flex items-start gap-3 w-full min-w-0">
      <div className="mt-0.5 p-1.5 rounded-md shrink-0 bg-emerald-500/15 text-emerald-400">
        <CreditCard className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-100 leading-none">
            Payment Completed
          </span>
          <Badge variant="outline" className="text-[10px] leading-none px-1.5 py-0.5 border-emerald-500/40 text-emerald-400">
            M-Pesa
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          <span className="font-medium text-emerald-400">
            KES {Number(n.amount ?? 0).toLocaleString()}
          </span>
          {n.receipt && (
            <span className="ml-1.5 text-slate-500">· {String(n.receipt)}</span>
          )}
          {!n.receipt && n.paymentId && (
            <span className="ml-1.5 text-slate-500">· ID #{String(n.paymentId)}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function NewUserRow({ n }: { n: AdminNotification }) {
  return (
    <div className="flex items-start gap-3 w-full min-w-0">
      <div className="mt-0.5 p-1.5 rounded-md shrink-0 bg-blue-500/15 text-blue-400">
        <UserPlus className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-slate-100">New Registration</span>
        <p className="text-xs text-slate-400 mt-1 truncate">
          {String(n.name ?? n.email ?? "Unknown user")}
          {n.name && n.email && (
            <span className="ml-1.5 text-slate-500">· {String(n.email)}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function SubscriptionActivatedRow({ n }: { n: AdminNotification }) {
  return (
    <div className="flex items-start gap-3 w-full min-w-0">
      <div className="mt-0.5 p-1.5 rounded-md shrink-0 bg-purple-500/15 text-purple-400">
        <ShieldCheck className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-slate-100">Subscription Activated</span>
        <p className="text-xs text-slate-400 mt-1">
          {n.daysSelected != null && (
            <span className="font-medium text-purple-400">{String(n.daysSelected)} days</span>
          )}
          {n.amount && <span className="ml-1.5 text-slate-500">· KES {String(n.amount)}</span>}
        </p>
      </div>
    </div>
  );
}

const MEDIA_ICONS: Record<string, React.ElementType> = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  LINK: Link2,
};

function AdApprovalRow({ n, onAction }: { n: AdminNotification; onAction: (id: string) => void }) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const MediaIcon = MEDIA_ICONS[String(n.mediaType ?? "IMAGE")] ?? ImageIcon;

  async function act(action: "approve" | "reject") {
    if (loading || done) return;
    setLoading(action);
    try {
      await customFetch(`/api/admin/advertisements/${n.adId}/${action}`, {
        method: "PATCH",
      });
      setDone(action === "approve" ? "approved" : "rejected");
      setTimeout(() => onAction(n.id), 1500);
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded-md shrink-0 bg-amber-500/15 text-amber-400">
          <MediaIcon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-100 leading-none">
              Ad Approval Request
            </span>
            <Badge variant="outline" className="text-[10px] leading-none px-1.5 py-0.5 border-amber-500/40 text-amber-400">
              {String(n.mediaType ?? "IMAGE")}
            </Badge>
          </div>
          <p className="text-xs text-slate-300 mt-1 font-medium truncate">
            {String(n.title ?? "Untitled")}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {n.totalDays != null && <span>{String(n.totalDays)} days</span>}
            {n.totalAmount != null && (
              <span className="ml-1.5">· KES {Number(n.totalAmount).toLocaleString()}</span>
            )}
          </p>
        </div>
      </div>
      {done ? (
        <div
          className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md ${
            done === "approved"
              ? "bg-green-500/10 text-green-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {done === "approved" ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
          {done === "approved" ? "Approved" : "Rejected"}
        </div>
      ) : (
        <div className="flex gap-2 pl-8">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300 flex-1"
            onClick={() => act("approve")}
            disabled={!!loading}
          >
            {loading === "approve" ? "…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 flex-1"
            onClick={() => act("reject")}
            disabled={!!loading}
          >
            {loading === "reject" ? "…" : "Reject"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── row wrapper ────────────────────────────────────────────────────────────

function NotifRow({
  n,
  isNew,
  onRemove,
  onAdAction,
}: {
  n: AdminNotification;
  isNew: boolean;
  onRemove: (id: string) => void;
  onAdAction: (id: string) => void;
}) {
  useTickingTime();

  return (
    <li
      className={`relative group flex gap-3 px-4 py-3.5 border-b border-slate-800/70 last:border-0 transition-colors ${
        isNew ? "bg-green-500/5" : "hover:bg-slate-800/30"
      }`}
    >
      <div className="flex-1 min-w-0">
        {n.eventType === "copy_trade_fan_out" && <CopyTradeFanOutRow n={n} />}
        {n.eventType === "payment_completed" && <PaymentCompletedRow n={n} />}
        {n.eventType === "new_user" && <NewUserRow n={n} />}
        {n.eventType === "subscription_activated" && <SubscriptionActivatedRow n={n} />}
        {n.eventType === "ad_approval_request" && (
          <AdApprovalRow n={n} onAction={onAdAction} />
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-slate-600 whitespace-nowrap">{timeAgo(n.ts)}</span>
        <button
          onClick={() => onRemove(n.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-600 hover:text-slate-400"
          title="Dismiss"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </li>
  );
}

// ─── main panel ─────────────────────────────────────────────────────────────

const NEW_THRESHOLD_MS = 8_000;

export function AdminLivePanel() {
  const { notifications, unread, markAllRead, clearAll, removeOne } = useAdminNotifications();
  const [connected, setConnected] = useState(true);
  const prevLenRef = useRef(notifications.length);
  const listRef = useRef<HTMLUListElement>(null);

  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (notifications.length > prevLenRef.current) {
      const latestId = notifications[0]?.id;
      if (latestId) {
        setNewIds((prev) => new Set([...prev, latestId]));
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(latestId);
            return next;
          });
        }, NEW_THRESHOLD_MS);
      }

      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
    }
    prevLenRef.current = notifications.length;
  }, [notifications]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => ws.close();
  }, []);

  const handleAdAction = useCallback(
    (id: string) => removeOne(id),
    [removeOne],
  );

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col">
      <CardHeader className="pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-slate-50 text-base">Live Event Feed</CardTitle>
            <div className="flex items-center gap-1.5">
              {connected ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Live
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <WifiOff className="w-3 h-3" />
                  Reconnecting…
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
              >
                {unread} new
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-600 hidden sm:block mr-1">
              {notifications.length} event{notifications.length !== 1 ? "s" : ""}
            </span>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-slate-500 hover:text-red-400 hover:bg-red-500/5"
                onClick={clearAll}
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {[
            { label: "Copy Trade", color: "text-green-400 border-green-500/30" },
            { label: "Payments", color: "text-emerald-400 border-emerald-500/30" },
            { label: "Ad Requests", color: "text-amber-400 border-amber-500/30" },
            { label: "Users", color: "text-blue-400 border-blue-500/30" },
            { label: "Subscriptions", color: "text-purple-400 border-purple-500/30" },
          ].map(({ label, color }) => (
            <span
              key={label}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${color} bg-transparent`}
            >
              {label}
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <Inbox className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No events yet</p>
            <p className="text-xs opacity-60 mt-1 text-center px-6">
              Copy-trade results, M-Pesa payments, and ad submissions will appear here in real time.
            </p>
          </div>
        ) : (
          <ul
            ref={listRef}
            className="divide-y divide-slate-800/50 max-h-[480px] overflow-y-auto"
          >
            {notifications.map((n) => (
              <NotifRow
                key={n.id}
                n={n}
                isNew={newIds.has(n.id)}
                onRemove={removeOne}
                onAdAction={handleAdAction}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
