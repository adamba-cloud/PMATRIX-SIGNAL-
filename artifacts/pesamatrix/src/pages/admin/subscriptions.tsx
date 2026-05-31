import { useListSubscriptions, getListSubscriptionsQueryKey, useListPayments, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Smartphone, CalendarDays, Banknote } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

function statusClass(status: string) {
  if (status === "ACTIVE") return "border-green-500 text-green-400 bg-green-500/10";
  if (status === "PENDING") return "border-yellow-500 text-yellow-400 bg-yellow-500/10";
  if (status === "EXPIRED") return "border-red-500 text-red-400 bg-red-500/10";
  return "border-slate-500 text-slate-400 bg-slate-500/10";
}

export default function AdminSubscriptions() {
  const { data: subscriptions, isLoading } = useListSubscriptions({
    query: { queryKey: getListSubscriptionsQueryKey() },
  });
  const { data: payments } = useListPayments({
    query: { queryKey: getListPaymentsQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  const paymentsBySubId = new Map(
    (payments ?? []).filter((p) => p.subscriptionId != null).map((p) => [p.subscriptionId, p])
  );

  const active = subscriptions?.filter((s) => s.status === "ACTIVE").length ?? 0;
  const pending = subscriptions?.filter((s) => s.status === "PENDING").length ?? 0;
  const revenue = subscriptions
    ?.filter((s) => s.status === "ACTIVE")
    .reduce((sum, s) => sum + s.totalAmount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Subscriptions</h2>
        <p className="text-slate-400">All user subscription records and M-Pesa payment status.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Active</p>
            <p className="text-2xl font-bold text-green-400">{active}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Pending</p>
            <p className="text-2xl font-bold text-yellow-400">{pending}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Value</p>
            <p className="text-2xl font-bold text-slate-100">KES {revenue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            All Subscriptions ({subscriptions?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptions && subscriptions.length > 0 ? (
            <div className="space-y-3">
              {subscriptions.map((sub) => {
                const payment = paymentsBySubId.get(sub.id);
                const daysLeft = sub.endDate
                  ? Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000))
                  : null;

                return (
                  <div
                    key={sub.id}
                    className="p-4 rounded-lg bg-slate-950 border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4"
                  >
                    {/* Left: Identity */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">#{sub.id}</span>
                        <Badge variant="outline" className={statusClass(sub.status)}>
                          {sub.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-300 font-medium">User #{sub.userId}</p>
                      {sub.phoneNumber && (
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Smartphone className="w-3 h-3" />
                          {sub.phoneNumber}
                        </p>
                      )}
                    </div>

                    {/* Middle: Duration & Amount */}
                    <div className="space-y-1.5">
                      <p className="text-sm text-slate-300 flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                        {sub.daysSelected} days
                        {daysLeft !== null && sub.status === "ACTIVE" && (
                          <span className={`ml-1 text-xs ${daysLeft <= 3 ? "text-red-400" : "text-green-400"}`}>
                            ({daysLeft}d left)
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-200 font-semibold flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5 text-slate-500" />
                        KES {sub.totalAmount.toLocaleString()}
                      </p>
                      {sub.startDate && sub.endDate && (
                        <p className="text-xs text-slate-500">
                          {format(new Date(sub.startDate), "MMM dd")} → {format(new Date(sub.endDate), "MMM dd, yyyy")}
                        </p>
                      )}
                    </div>

                    {/* Right: Payment */}
                    <div className="space-y-1.5">
                      {payment ? (
                        <>
                          <p className="text-xs text-slate-400 uppercase tracking-wide">M-Pesa</p>
                          {payment.mpesaReceiptNumber ? (
                            <p className="text-xs font-mono text-green-400">{payment.mpesaReceiptNumber}</p>
                          ) : (
                            <p className="text-xs text-slate-500">No receipt yet</p>
                          )}
                          <p className="text-xs text-slate-500">
                            {format(new Date(sub.createdAt), "MMM dd, yyyy HH:mm")}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-600">No payment record</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-slate-700" />
              <p>No subscriptions yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
