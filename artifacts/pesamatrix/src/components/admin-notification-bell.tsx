import { useRef, useState, useEffect } from "react";
import { Bell, UserPlus, CreditCard, ShieldCheck, Trash2, X } from "lucide-react";
import { useAdminNotifications, type AdminNotification } from "@/hooks/use-admin-notifications";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotifIcon({ type }: { type: AdminNotification["eventType"] }) {
  if (type === "new_user") return <UserPlus className="w-4 h-4 text-blue-400 flex-shrink-0" />;
  if (type === "payment_completed") return <CreditCard className="w-4 h-4 text-green-400 flex-shrink-0" />;
  return <ShieldCheck className="w-4 h-4 text-purple-400 flex-shrink-0" />;
}

function notifTitle(n: AdminNotification): string {
  if (n.eventType === "new_user") return `New user: ${n.name ?? n.email ?? "unknown"}`;
  if (n.eventType === "payment_completed") return `Payment KES ${n.amount ?? ""} completed`;
  return `Subscription activated — ${n.days ?? "?"} days`;
}

function notifSub(n: AdminNotification): string {
  if (n.eventType === "new_user") return String(n.email ?? "");
  if (n.eventType === "payment_completed") return String(n.receipt ? `Receipt: ${n.receipt}` : `ID #${n.paymentId}`);
  return String(n.amount ? `KES ${n.amount}` : "");
}

export function AdminNotificationBell() {
  const { notifications, unread, markAllRead, clearAll } = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle() {
    setOpen((o) => {
      if (!o) markAllRead();
      return !o;
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Admin notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 rounded-xl border border-border bg-card shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Activity Feed</span>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Bell className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-xs">No activity yet</p>
                <p className="text-xs opacity-60 mt-1">New registrations, payments &amp; subscriptions appear here</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
                    <div className="mt-0.5">
                      <NotifIcon type={n.eventType} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{notifTitle(n)}</p>
                      {notifSub(n) && (
                        <p className="text-xs text-muted-foreground truncate">{notifSub(n)}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 flex-shrink-0">
                      {timeAgo(n.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
