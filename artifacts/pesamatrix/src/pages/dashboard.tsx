import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivitySquare, TrendingUp, ShieldCheck, Target, Loader2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useForexPrices } from "@/hooks/useForexPrices";
import { DashboardAdSection } from "@/components/dashboard-ad-section";

const MARKET_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSDT"];

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { prices, connected } = useForexPrices();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-slate-400">Welcome back. Here's your trading overview.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Signals</CardTitle>
            <ActivitySquare className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-50">{summary.totalSignals}</div>
            <p className="text-xs text-green-500 mt-1">+{summary.weeklySignalChange}% from last week</p>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Win Rate</CardTitle>
            <Target className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-50">{summary.winRate}%</div>
            <p className="text-xs text-green-500 mt-1">+{summary.winRateChange}% from last week</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Profit Pips</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">+{summary.totalProfitPips}</div>
            <p className="text-xs text-slate-400 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Active Plan</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-50">{summary.activePlan}</div>
            <p className="text-xs text-slate-400 mt-1">Status: Active</p>
          </CardContent>
        </Card>
      </div>

      <DashboardAdSection />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-50">Performance Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.performanceData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}p`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                    itemStyle={{ color: '#22c55e' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#22c55e', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-slate-50">Live Market Overview</CardTitle>
            <span className={`flex items-center gap-1.5 text-xs font-medium ${connected ? "text-green-400" : "text-slate-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-slate-500"}`} />
              {connected ? "Live" : "Connecting…"}
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MARKET_PAIRS.map((key) => {
                const p = prices[key];
                const displayPair = key.replace("USDT", "/USDT").replace(/([A-Z]{3})([A-Z]{3})$/, "$1/$2");
                const price = p ? p.price.toLocaleString("en-US", { maximumFractionDigits: 5 }) : "—";
                const pct = p ? `${p.changePercent >= 0 ? "+" : ""}${p.changePercent.toFixed(2)}%` : "";
                const up = p ? p.up : true;
                return (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 transition-colors duration-200">
                    <div className="font-medium text-slate-200 text-sm">{displayPair}</div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm text-slate-100 tabular-nums">{price}</span>
                      <span className={`text-xs font-semibold w-16 text-right tabular-nums transition-colors duration-300 ${up ? "text-green-400" : "text-red-400"}`}>
                        {pct}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}