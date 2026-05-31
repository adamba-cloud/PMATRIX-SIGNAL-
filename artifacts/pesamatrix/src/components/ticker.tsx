import { useEffect, useState } from "react";

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
  const [prices, setPrices] = useState<Record<string, { bid: string; ask: string; up: boolean }>>({});

  useEffect(() => {
    // Mocking live price updates
    const interval = setInterval(() => {
      setPrices((prev) => {
        const newPrices = { ...prev };
        const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
        const base = Math.random() * 100 + 1;
        newPrices[pair] = {
          bid: base.toFixed(4),
          ask: (base + 0.0005).toFixed(4),
          up: Math.random() > 0.5,
        };
        return newPrices;
      });
    }, 2000);

    // Initial populate
    const initial: Record<string, { bid: string; ask: string; up: boolean }> = {};
    PAIRS.forEach((p) => {
      const base = Math.random() * 100 + 1;
      initial[p] = {
        bid: base.toFixed(4),
        ask: (base + 0.0005).toFixed(4),
        up: Math.random() > 0.5,
      };
    });
    setPrices(initial);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-slate-950 border-b border-slate-900 overflow-hidden flex items-center h-10 text-xs font-mono font-medium relative z-50">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...PAIRS, ...PAIRS, ...PAIRS].map((pair, i) => (
          <div key={i} className="flex items-center space-x-3 mx-6">
            <span className="text-slate-400">{pair}</span>
            <span className={prices[pair]?.up ? "text-green-500" : "text-red-500"}>
              {prices[pair]?.bid || "0.0000"}
            </span>
          </div>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
      `}} />
    </div>
  );
}