import { useGetMyPayments, getGetMyPaymentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, CheckCircle2, XCircle, Clock, Smartphone } from "lucide-react";
import { format } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED") return (
    <Badge variant="outline" className="border-green-500 text-green-400 bg-green-500/10 gap-1">
      <CheckCircle2 className="w-3 h-3" /> Completed
    </Badge>
  );
  if (status === "PENDING") return (
    <Badge variant="outline" className="border-yellow-500 text-yellow-400 bg-yellow-500/10 gap-1">
      <Clock className="w-3 h-3" /> Pending
    </Badge>
  );
  if (status === "FAILED") return (
    <Badge variant="outline" className="border-red-500 text-red-400 bg-red-500/10 gap-1">
      <XCircle className="w-3 h-3" /> Failed
    </Badge>
  );
  return (
    <Badge variant="outline" className="border-slate-500 text-slate-400 gap-1">
      {status}
    </Badge>
  );
}

export default function Payments() {
  const { data: payments, isLoading } = useGetMyPayments({ query: { queryKey: getGetMyPaymentsQueryKey() } });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Payment History</h2>
        <p className="text-slate-400">All your M-Pesa transactions and subscription payments.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-green-500" />
            M-Pesa Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-slate-950 border border-slate-800 gap-3"
                >
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      payment.status === "COMPLETED" ? "bg-green-500/15" :
                      payment.status === "PENDING"   ? "bg-yellow-500/15" :
                                                        "bg-red-500/15"
                    }`}>
                      {payment.status === "COMPLETED" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                       payment.status === "PENDING"   ? <Clock className="w-4 h-4 text-yellow-400" /> :
                                                         <XCircle className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-slate-200 font-semibold text-sm">
                        KES {payment.amount.toLocaleString()}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {format(new Date(payment.createdAt), "MMM dd, yyyy · HH:mm")}
                      </p>
                      {payment.phoneNumber && (
                        <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                          <Smartphone className="w-3 h-3" />
                          {payment.phoneNumber}
                        </p>
                      )}
                      {payment.mpesaReceiptNumber && (
                        <p className="text-xs text-green-400 font-mono mt-1">
                          Receipt: {payment.mpesaReceiptNumber}
                        </p>
                      )}
                      {payment.failureReason && (
                        <p className="text-xs text-red-400 mt-1">{payment.failureReason}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 sm:text-right flex-shrink-0">
                    <StatusBadge status={payment.status} />
                    <span className="text-xs text-slate-500 uppercase tracking-wide">{payment.method}</span>
                    {payment.completedAt && (
                      <span className="text-xs text-slate-600">
                        Confirmed {format(new Date(payment.completedAt), "HH:mm")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 flex flex-col items-center gap-3">
              <CreditCard className="w-12 h-12 text-slate-700" />
              <p className="font-medium">No transactions yet.</p>
              <p className="text-sm text-slate-600">Your M-Pesa payments will appear here after you subscribe.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
