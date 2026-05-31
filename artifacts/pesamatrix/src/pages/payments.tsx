import { useGetMyPayments, getGetMyPaymentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CreditCard } from "lucide-react";
import { format } from "date-fns";

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
        <p className="text-slate-400">View your transaction history and payment status.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50">Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="rounded-md border border-slate-800">
              <Table>
                <TableHeader className="bg-slate-950/50">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Date</TableHead>
                    <TableHead className="text-slate-400">Reference</TableHead>
                    <TableHead className="text-slate-400">Method</TableHead>
                    <TableHead className="text-slate-400">Amount</TableHead>
                    <TableHead className="text-right text-slate-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-300">
                        {format(new Date(payment.createdAt), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">
                        {payment.reference || '-'}
                      </TableCell>
                      <TableCell className="text-slate-300 capitalize">
                        {payment.method}
                      </TableCell>
                      <TableCell className="font-medium text-slate-200">
                        KES {payment.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={`
                          ${payment.status === 'COMPLETED' ? 'border-green-500 text-green-500 bg-green-500/10' : ''}
                          ${payment.status === 'PENDING' ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : ''}
                          ${payment.status === 'FAILED' ? 'border-red-500 text-red-500 bg-red-500/10' : ''}
                        `}>
                          {payment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 flex flex-col items-center">
              <CreditCard className="w-12 h-12 mb-4 text-slate-700" />
              <p>No payment history found.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}