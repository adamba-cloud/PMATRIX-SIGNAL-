import { useForexPrices } from "@/hooks/useForexPrices";

const PAIRS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "XAGUSD",
  "AUDUSD",
  "USDCAD",
  "BTCUSDT",
];

export function Ticker() {
  const { prices, connected } = useForexPrices();

  const displayPairs = [...PAIRS, ...PAIRS, ...PAIRS];

  return (
    <div className="w-full bg-slate-950 border-b border-slate-900 overflow-hidden flex items-center h-10 text-xs font-mono font-medium relative z-50">
      {connected && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse z-10" />
      )}
      <div className="flex animate-marquee whitespace-nowrap">
        {displayPairs.map((pair, i) => {
          const p = prices[pair];
          const price = p ? p.price.toString() : "—";
          const up = p ? p.up : true;
          const pct = p ? (p.changePercent >= 0 ? "+" : "") + p.changePercent.toFixed(3) + "%" : "";
          return (
            <div key={i} className="flex items-center gap-2 mx-6">
              <span className="text-slate-400">{pair}</span>
              <span className={up ? "text-green-400" : "text-red-400"}>
                {price}
              </span>
              {pct && (
                <span className={`text-[10px] ${up ? "text-green-600" : "text-red-600"}`}>
                  {pct}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}} />
    </div>
  );
}
