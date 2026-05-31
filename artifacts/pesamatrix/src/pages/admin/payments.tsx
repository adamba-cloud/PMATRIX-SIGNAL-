import { useListPayments, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, CheckCircle2, XCircle, Clock, Smartphone, Banknote } from "lucide-react";
import { format } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED")
    return <Badge variant="outline" className="border-green-500 text-green-400 bg-green-500/10 gap-1"><CheckCircle2 className="w-3 h-3" />Completed</Badge>;
  if (status === "PENDING")
    return <Badge variant="outline" className="border-yellow-500 text-yellow-400 bg-yellow-500/10 gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
  if (status === "FAILED")
    return <Badge variant="outline" className="border-red-500 text-red-400 bg-red-500/10 gap-1"><XCircle className="w-3 h-3" />Failed</Badge>;
  return <Badge variant="outline" className="border-slate-500 text-slate-400 gap-1">{status}</Badge>;
}

export default function AdminPayments() {
  const { data: payments, isLoading } = useListPayments({
    query: { queryKey: getListPaymentsQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  const completed = payments?.filter((p) => p.status === "COMPLETED") ?? [];
  const pending = payments?.filter((p) => p.status === "PENDING") ?? [];
  const failed = payments?.filter((p) => p.status === "FAILED") ?? [];
  const totalRevenue = completed.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Payments</h2>
        <p className="text-slate-400">All M-Pesa transactions across the platform.</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: `KES ${totalRevenue.toLocaleString()}`, color: "text-green-400" },
          { label: "Completed", value: completed.length, color: "text-green-400" },
          { label: "Pending", value: pending.length, color: "text-yellow-400" },
          { label: "Failed", value: failed.length, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-slate-900 border-slate-800">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-500" />
            All Transactions ({payments?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-slate-950 border border-slate-800 gap-3"
                >
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      p.status === "COMPLETED" ? "bg-green-500/15" :
                      p.status === "PENDING"   ? "bg-yellow-500/15" :
                                                  "bg-red-500/15"
                    }`}>
                      {p.status === "COMPLETED" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                       p.status === "PENDING"   ? <Clock className="w-4 h-4 text-yellow-400" /> :
                                                   <XCircle className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-200 font-semibold text-sm flex items-center gap-1">
                          <Banknote className="w-3.5 h-3.5 text-slate-500" />
                          KES {p.amount.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">User #{p.userId}</span>
                      </div>
                      {p.phoneNumber && (
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Smartphone className="w-3 h-3" /> {p.phoneNumber}
                        </p>
                      )}
                      {p.mpesaReceiptNumber && (
                        <p className="text-xs text-green-400 font-mono">Receipt: {p.mpesaReceiptNumber}</p>
                      )}
                      {p.failureReason && (
                        <p className="text-xs text-red-400">{p.failureReason}</p>
                      )}
                      <p className="text-xs text-slate-600">
                        {format(new Date(p.createdAt), "MMM dd, yyyy · HH:mm")}
                        {p.completedAt && ` · confirmed ${format(new Date(p.completedAt), "HH:mm")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-slate-500 uppercase tracking-wide">{p.method}</span>
                    {p.subscriptionId && (
                      <span className="text-xs text-slate-600">Sub #{p.subscriptionId}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 flex flex-col items-center gap-3">
              <CreditCard className="w-10 h-10 text-slate-700" />
              <p>No transactions yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
