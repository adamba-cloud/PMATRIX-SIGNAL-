import { useListSubscriptions, getListSubscriptionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function AdminSubscriptions() {
  const { data: subscriptions, isLoading } = useListSubscriptions({ query: { queryKey: getListSubscriptionsQueryKey() } });

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
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Subscriptions</h2>
        <p className="text-slate-400">Manage all user subscriptions.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50">All Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-800">
            <Table>
              <TableHeader className="bg-slate-950/50">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 w-16">ID</TableHead>
                  <TableHead className="text-slate-400">User ID</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Duration</TableHead>
                  <TableHead className="text-slate-400">Amount</TableHead>
                  <TableHead className="text-right text-slate-400">Dates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions?.map((sub) => (
                  <TableRow key={sub.id} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell className="font-mono text-slate-500">#{sub.id}</TableCell>
                    <TableCell className="text-slate-300">User #{sub.userId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`
                        ${sub.status === 'ACTIVE' ? 'border-green-500 text-green-500 bg-green-500/10' : ''}
                        ${sub.status === 'PENDING' ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : ''}
                        ${sub.status === 'EXPIRED' ? 'border-red-500 text-red-500 bg-red-500/10' : ''}
                        ${sub.status === 'CANCELLED' ? 'border-slate-500 text-slate-500 bg-slate-500/10' : ''}
                      `}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{sub.daysSelected} days</TableCell>
                    <TableCell className="font-medium text-slate-200">KES {sub.totalAmount}</TableCell>
                    <TableCell className="text-right text-xs text-slate-400">
                      {sub.startDate ? format(new Date(sub.startDate), 'MMM dd, yyyy') : '-'}
                      {" to "}
                      {sub.endDate ? format(new Date(sub.endDate), 'MMM dd, yyyy') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {!subscriptions?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                      No subscriptions found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}