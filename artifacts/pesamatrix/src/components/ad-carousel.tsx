import { useEffect, useState, useRef } from "react";
import { ExternalLink, ChevronLeft, ChevronRight, Megaphone, ImageOff } from "lucide-react";
import { useGetActiveAdvertisements, useGetAdBroadcastConfig, recordAdImpression, type Advertisement } from "@workspace/api-client-react";

function AdSlide({ ad }: { ad: Advertisement }) {
  const [imgError, setImgError] = useState(false);
  const [vidError, setVidError] = useState(false);

  const media = (() => {
    if (ad.mediaType === "IMAGE" && ad.mediaUrl && !imgError) {
      return (
        <img
          src={ad.mediaUrl}
          alt={ad.title}
          className="h-10 w-16 object-cover rounded flex-shrink-0"
          onError={() => setImgError(true)}
        />
      );
    }
    if (ad.mediaType === "VIDEO" && ad.mediaUrl && !vidError) {
      return (
        <video
          key={ad.mediaUrl}
          className="h-10 w-16 object-cover rounded flex-shrink-0"
          muted
          autoPlay
          loop
          playsInline
          onError={() => setVidError(true)}
        >
          <source src={ad.mediaUrl} />
        </video>
      );
    }
    if (imgError || vidError) {
      return (
        <div className="h-10 w-16 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
          <ImageOff className="w-4 h-4 text-slate-600" />
        </div>
      );
    }
    return null;
  })();

  const inner = (
    <div className="flex items-center gap-4 h-full px-6 w-full">
      {media}
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
    query: { refetchInterval: 60_000, retry: false },
  });
  const { data: config } = useGetAdBroadcastConfig({
    query: { retry: false },
  });

  const intervalMs = (config?.broadcastIntervalSeconds ?? 30) * 1000;

  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % Math.max(ads.length, 1));
    }, intervalMs);
  };

  useEffect(() => {
    if (ads.length > 1) startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [ads.length, intervalMs]);

  useEffect(() => {
    if (index >= ads.length && ads.length > 0) setIndex(0);
  }, [ads.length, index]);

  // Record one impression each time a new ad becomes visible
  useEffect(() => {
    const currentAd = ads[index];
    if (currentAd) recordAdImpression(currentAd.id);
  }, [index, ads]);

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
