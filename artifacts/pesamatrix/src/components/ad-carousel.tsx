import { useEffect, useState, useRef } from "react";
import { ExternalLink, ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { useGetActiveAdvertisements, type Advertisement } from "@workspace/api-client-react";

function AdSlide({ ad }: { ad: Advertisement }) {
  const inner = (
    <div className="flex items-center gap-4 h-full px-6 w-full">
      {ad.mediaType === "IMAGE" && ad.mediaUrl && (
        <img
          src={ad.mediaUrl}
          alt={ad.title}
          className="h-10 w-16 object-cover rounded flex-shrink-0"
        />
      )}
      {ad.mediaType === "VIDEO" && ad.mediaUrl && (
        <video
          src={ad.mediaUrl}
          className="h-10 w-16 object-cover rounded flex-shrink-0"
          muted
          autoPlay
          loop
          playsInline
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-100 truncate">{ad.title}</p>
        {ad.description && (
          <p className="text-xs text-slate-400 truncate">{ad.description}</p>
        )}
      </div>
      {ad.externalLink && (
        <span className="text-xs text-green-400 flex items-center gap-1 flex-shrink-0">
          Visit <ExternalLink className="w-3 h-3" />
        </span>
      )}
    </div>
  );

  if (ad.externalLink) {
    return (
      <a
        href={ad.externalLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center h-full w-full hover:bg-white/5 transition-colors cursor-pointer"
      >
        {inner}
      </a>
    );
  }

  return <div className="flex items-center h-full w-full">{inner}</div>;
}

export function AdCarousel() {
  const { data: ads = [] } = useGetActiveAdvertisements({
    query: { refetchInterval: 60000, retry: false },
  });

  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % (ads.length || 1));
    }, 6000);
  };

  useEffect(() => {
    if (ads.length > 1) startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [ads.length]);

  useEffect(() => {
    if (index >= ads.length && ads.length > 0) setIndex(0);
  }, [ads.length, index]);

  if (ads.length === 0) return null;

  const go = (dir: 1 | -1) => {
    setIndex((i) => (i + dir + ads.length) % ads.length);
    startTimer();
  };

  const ad = ads[index];

  return (
    <div className="h-12 bg-slate-900/80 border-b border-slate-800 flex items-center flex-shrink-0 relative overflow-hidden">
      <div className="flex items-center gap-2 px-3 text-xs text-slate-500 flex-shrink-0 border-r border-slate-800 h-full">
        <Megaphone className="w-3.5 h-3.5 text-green-500" />
        <span className="uppercase tracking-wide font-semibold text-green-500">Sponsored</span>
      </div>

      <div className="flex-1 overflow-hidden h-full relative">
        <div
          key={ad.id}
          className="absolute inset-0 animate-in fade-in duration-500"
        >
          <AdSlide ad={ad} />
        </div>
      </div>

      {ads.length > 1 && (
        <div className="flex items-center gap-1 px-2 flex-shrink-0 border-l border-slate-800 h-full">
          <button
            onClick={() => go(-1)}
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-slate-600 tabular-nums">
            {index + 1}/{ads.length}
          </span>
          <button
            onClick={() => go(1)}
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
