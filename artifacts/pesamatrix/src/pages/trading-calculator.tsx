import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Calculator,
  TrendingUp,
  ShieldAlert,
  Flame,
  Leaf,
  Info,
} from "lucide-react";

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUSD(n: number) {
  return "$" + fmt(n, 2);
}

function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + fmt(n, 2) + "%";
}

interface CalcResult {
  riskAmount: number;
  profitPerWin: number;
  lossPerLoss: number;
  expectedWeeklyProfit: number;
  expectedMonthlyProfit: number;
  balance1m: number;
  balance3m: number;
  balance6m: number;
  balance12m: number;
  growthPct1m: number;
  growthPct12m: number;
  chartData: { label: string; balance: number; month: number }[];
}

function calculate(
  balance: number,
  riskPct: number,
  rewardRatio: number,
  tradesPerWeek: number,
  winRate: number
): CalcResult {
  const wr = winRate / 100;
  const riskAmount = balance * (riskPct / 100);
  const profitPerWin = riskAmount * rewardRatio;
  const lossPerLoss = riskAmount;
  const expectancyPerTrade = wr * profitPerWin - (1 - wr) * lossPerLoss;
  const expectedWeeklyProfit = expectancyPerTrade * tradesPerWeek;
  const expectedMonthlyProfit = expectedWeeklyProfit * 4.33;

  // Compound weekly over 52 weeks
  const weeklyGrowthRate = expectancyPerTrade / balance;
  let runningBalance = balance;
  const chartData: { label: string; balance: number; month: number }[] = [
    { label: "Start", balance: parseFloat(balance.toFixed(2)), month: 0 },
  ];

  for (let week = 1; week <= 52; week++) {
    const weekRisk = runningBalance * (riskPct / 100);
    const weekExpectancy = (wr * weekRisk * rewardRatio - (1 - wr) * weekRisk) * tradesPerWeek;
    runningBalance += weekExpectancy;
    if (runningBalance < 0) runningBalance = 0;

    const month = Math.round(week / 4.33);
    if ([4, 9, 13, 17, 22, 26, 30, 35, 39, 43, 48, 52].includes(week)) {
      chartData.push({
        label: `M${month}`,
        balance: parseFloat(runningBalance.toFixed(2)),
        month,
      });
    }
  }

  // Also compute compounded milestones
  const weeksIn = (months: number) => Math.round(months * 4.33);
  const compoundTo = (months: number) => {
    let b = balance;
    const weeks = weeksIn(months);
    for (let w = 0; w < weeks; w++) {
      const r = b * (riskPct / 100);
      b += (wr * r * rewardRatio - (1 - wr) * r) * tradesPerWeek;
      if (b < 0) { b = 0; break; }
    }
    return b;
  };

  const balance1m = compoundTo(1);
  const balance3m = compoundTo(3);
  const balance6m = compoundTo(6);
  const balance12m = compoundTo(12);

  return {
    riskAmount,
    profitPerWin,
    lossPerLoss,
    expectedWeeklyProfit,
    expectedMonthlyProfit,
    balance1m,
    balance3m,
    balance6m,
    balance12m,
    growthPct1m: ((balance1m - balance) / balance) * 100,
    growthPct12m: ((balance12m - balance) / balance) * 100,
    chartData,
  };
}

const RISK_PRESETS = [
  { label: "Conservative", value: 1, icon: Leaf, color: "text-green-400", bg: "bg-green-500/10 border-green-500/30 hover:border-green-400" },
  { label: "Moderate", value: 2, icon: ShieldAlert, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-400" },
  { label: "Aggressive", value: 3, icon: Flame, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30 hover:border-red-400" },
];

const RR_OPTIONS = [
  { label: "1:1", value: 1 },
  { label: "1:2", value: 2 },
  { label: "1:3", value: 3 },
  { label: "1:5", value: 5 },
];

function StatRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-mono font-semibold text-sm ${positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 shadow-xl">
        <p className="text-slate-400 text-xs mb-1">{label}</p>
        <p className="text-green-400 font-bold font-mono">{fmtUSD(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export default function TradingCalculator() {
  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [rewardRatio, setRewardRatio] = useState(2);
  const [tradesPerWeek, setTradesPerWeek] = useState("5");
  const [winRate, setWinRate] = useState("55");

  const parsed = useMemo(() => {
    const b = parseFloat(balance) || 0;
    const r = parseFloat(riskPct) || 0;
    const t = parseFloat(tradesPerWeek) || 0;
    const w = parseFloat(winRate) || 0;
    return { b, r, t, w };
  }, [balance, riskPct, tradesPerWeek, winRate]);

  const result = useMemo<CalcResult | null>(() => {
    const { b, r, t, w } = parsed;
    if (b <= 0 || r <= 0 || t <= 0 || w <= 0 || w > 100) return null;
    return calculate(b, r, rewardRatio, t, w);
  }, [parsed, rewardRatio]);

  const riskLevel = parseFloat(riskPct) <= 1 ? RISK_PRESETS[0] : parseFloat(riskPct) <= 2 ? RISK_PRESETS[1] : RISK_PRESETS[2];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Calculator className="w-8 h-8 text-green-500" />
            Trading Growth Calculator
          </h2>
          <p className="text-slate-400 mt-1">Estimate potential account growth based on your risk strategy.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-3 py-2 rounded-lg text-xs">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Educational tool only — does not guarantee profits</span>
        </div>
      </div>

      {/* Summary cards */}
      {result && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">Current Balance</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold text-white font-mono">{fmtUSD(parsed.b)}</div>
              <p className="text-xs text-slate-500 mt-1">Starting capital</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">Monthly Growth</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-bold font-mono ${result.expectedMonthlyProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {result.expectedMonthlyProfit >= 0 ? "+" : ""}{fmtUSD(result.expectedMonthlyProfit)}
              </div>
              <p className="text-xs text-slate-500 mt-1">{fmtPct(result.growthPct1m)} expected</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">Annual Growth</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-bold font-mono ${result.balance12m >= parsed.b ? "text-green-400" : "text-red-400"}`}>
                {fmtPct(result.growthPct12m)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Compounded over 12 months</p>
            </CardContent>
          </Card>

          <Card className={`border ${riskLevel.bg}`}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">Risk Level</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-bold ${riskLevel.color} flex items-center gap-2`}>
                <riskLevel.icon className="w-6 h-6" />
                {riskLevel.label}
              </div>
              <p className="text-xs text-slate-500 mt-1">{riskPct}% risk per trade</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Inputs */}
        <div className="lg:col-span-2 space-y-5">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white">Strategy Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Account Balance */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Account Balance (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                  <Input
                    type="number"
                    min="1"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white pl-7 focus:border-green-500 focus:ring-green-500/20 font-mono"
                    placeholder="10000"
                  />
                </div>
              </div>

              {/* Risk Per Trade */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Risk Per Trade (%)</Label>
                <div className="flex gap-2 mb-2">
                  {RISK_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setRiskPct(String(p.value))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-all ${
                        parseFloat(riskPct) === p.value
                          ? `${p.bg} ${p.color} border-current`
                          : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={riskPct}
                    onChange={(e) => setRiskPct(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white pr-8 focus:border-green-500 focus:ring-green-500/20 font-mono"
                    placeholder="1"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                </div>
              </div>

              {/* Risk:Reward Ratio */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Risk : Reward Ratio</Label>
                <div className="grid grid-cols-4 gap-2">
                  {RR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRewardRatio(opt.value)}
                      className={`py-2 text-xs font-mono font-semibold rounded-md border transition-all ${
                        rewardRatio === opt.value
                          ? "bg-green-500/15 border-green-500 text-green-400"
                          : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trades Per Week */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Trades Per Week</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={tradesPerWeek}
                  onChange={(e) => setTradesPerWeek(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white focus:border-green-500 focus:ring-green-500/20 font-mono"
                  placeholder="5"
                />
              </div>

              {/* Win Rate */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Win Rate (%)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    step="0.5"
                    value={winRate}
                    onChange={(e) => setWinRate(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white pr-8 focus:border-green-500 focus:ring-green-500/20 font-mono"
                    placeholder="55"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                </div>
                {/* Win rate bar */}
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(parseFloat(winRate) || 0, 100)}%`,
                      background: `linear-gradient(to right, #ef4444, #eab308 50%, #22c55e)`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results + Chart */}
        <div className="lg:col-span-3 space-y-5">
          {/* Trade metrics */}
          {result ? (
            <>
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">Per-Trade Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <StatRow label="Risk Amount Per Trade" value={fmtUSD(result.riskAmount)} />
                  <StatRow label="Profit Per Winning Trade" value={"+" + fmtUSD(result.profitPerWin)} positive={true} />
                  <StatRow label="Loss Per Losing Trade" value={"-" + fmtUSD(result.lossPerLoss)} positive={false} />
                  <StatRow label="R:R Ratio" value={`1 : ${rewardRatio}`} />
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">Expected Returns</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <StatRow label="Expected Weekly Profit" value={(result.expectedWeeklyProfit >= 0 ? "+" : "") + fmtUSD(result.expectedWeeklyProfit)} positive={result.expectedWeeklyProfit >= 0} />
                  <StatRow label="Expected Monthly Profit" value={(result.expectedMonthlyProfit >= 0 ? "+" : "") + fmtUSD(result.expectedMonthlyProfit)} positive={result.expectedMonthlyProfit >= 0} />
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">Projected Account Balance</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <StatRow label="After 1 Month" value={fmtUSD(result.balance1m)} positive={result.balance1m >= parsed.b} />
                  <StatRow label="After 3 Months" value={fmtUSD(result.balance3m)} positive={result.balance3m >= parsed.b} />
                  <StatRow label="After 6 Months" value={fmtUSD(result.balance6m)} positive={result.balance6m >= parsed.b} />
                  <StatRow label="After 12 Months" value={fmtUSD(result.balance12m)} positive={result.balance12m >= parsed.b} />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Calculator className="w-12 h-12 text-slate-700 mb-4" />
                <p className="text-slate-500 text-sm">Fill in all fields to see your projections.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Growth Chart */}
      {result && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                12-Month Growth Projection
              </CardTitle>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-green-500 rounded" />
                  Projected Balance
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => "$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
                    width={58}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={parsed.b}
                    stroke="#475569"
                    strokeDasharray="4 4"
                    label={{ value: "Start", fill: "#475569", fontSize: 10, position: "insideTopLeft" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#balGrad)"
                    dot={{ fill: "#22c55e", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#22c55e", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Milestone badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              {[
                { label: "1 Month", bal: result.balance1m },
                { label: "3 Months", bal: result.balance3m },
                { label: "6 Months", bal: result.balance6m },
                { label: "12 Months", bal: result.balance12m },
              ].map(({ label, bal }) => {
                const gain = ((bal - parsed.b) / parsed.b) * 100;
                const isPos = bal >= parsed.b;
                return (
                  <div key={label} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className="font-mono font-bold text-sm text-slate-100">{fmtUSD(bal)}</p>
                    <p className={`text-xs font-medium mt-0.5 ${isPos ? "text-green-400" : "text-red-400"}`}>
                      {fmtPct(gain)}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-3 bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-3 text-xs text-slate-500">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-600" />
        <p>
          This calculator is an <strong className="text-slate-400">educational planning tool only</strong>. 
          Projections are based on the mathematical expectancy of your inputs assuming consistent execution. 
          Past performance does not guarantee future results. This tool does not connect to MT5, execute trades, 
          or guarantee any profits. Always manage risk responsibly.
        </p>
      </div>
    </div>
  );
}
