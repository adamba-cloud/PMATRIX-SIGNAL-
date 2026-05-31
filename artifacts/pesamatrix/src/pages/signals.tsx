import { useListSignals, getListSignalsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowUpRight, ArrowDownRight, Target } from "lucide-react";
import { format } from "date-fns";

export default function Signals() {
  const { data: signals, isLoading } = useListSignals({ query: { queryKey: getListSignalsQueryKey() } });

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
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Trading Signals</h2>
        <p className="text-slate-400">Real-time forex and crypto trading alerts.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50">All Signals</CardTitle>
        </CardHeader>
        <CardContent>
          {signals && signals.length > 0 ? (
            <div className="space-y-4">
              {signals.map((signal) => (
                <div key={signal.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${signal.direction === 'BUY' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {signal.direction === 'BUY' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-slate-200">{signal.pair}</span>
                        <Badge variant="outline" className={`text-xs ${
                          signal.status === 'ACTIVE' ? 'border-green-500 text-green-500' : 
                          signal.status === 'CLOSED' ? 'border-slate-600 text-slate-400' : 
                          'border-yellow-500 text-yellow-500'
                        }`}>
                          {signal.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500">{format(new Date(signal.createdAt), 'MMM dd, yyyy HH:mm')}</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-8 md:gap-12">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 font-medium">Entry Price</div>
                      <div className="font-mono text-sm text-slate-300">{signal.entryPrice}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 font-medium">Take Profit</div>
                      <div className="font-mono text-sm text-green-500">{signal.takeProfit}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 font-medium">Stop Loss</div>
                      <div className="font-mono text-sm text-red-500">{signal.stopLoss}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end min-w-[80px]">
                    {signal.pips !== null && (
                      <Badge variant="outline" className={`px-2 py-1 ${signal.pips > 0 ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {signal.pips > 0 ? '+' : ''}{signal.pips} Pips
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 flex flex-col items-center">
              <Target className="w-12 h-12 mb-4 text-slate-700" />
              <p>No signals available at the moment.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}