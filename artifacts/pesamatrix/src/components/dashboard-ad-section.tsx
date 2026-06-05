import { useEffect, useRef, useState, useCallback } from "react";
import { ExternalLink, ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { useGetActiveAdvertisements, type Advertisement } from "@workspace/api-client-react";

// ── Single ad slide ───────────────────────────────────────────────────────────

function AdMedia({ ad, visible }: { ad: Advertisement; visible: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (visible) {
      el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [visible]);

  if (ad.mediaType === "IMAGE" && ad.mediaUrl) {
    return (
      <img
        src={ad.mediaUrl}
        alt={ad.title}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
    );
  }

  if (ad.mediaType === "VIDEO" && ad.mediaUrl) {
    return (
      <video
        ref={videoRef}
        src={ad.mediaUrl}
        className="w-full h-full object-cover"
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
      <Megaphone className="w-12 h-12 text-green-500/40" />
    </div>
  );
}

function AdSlide({
  ad,
  active,
  direction,
}: {
  ad: Advertisement;
  active: boolean;
  direction: "left" | "right";
}) {
  const content = (
    <div className="relative w-full h-full group">
      <AdMedia ad={ad} visible={active} />

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm sm:text-base leading-tight line-clamp-1">
              {ad.title}
            </p>
            {ad.description && (
              <p className="text-slate-300 text-xs sm:text-sm mt-0.5 line-clamp-2 leading-snug">
                {ad.description}
              </p>
            )}
          </div>
          {ad.externalLink && (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-400/10 border border-green-400/30 px-2.5 py-1.5 rounded-full shrink-0 group-hover:bg-green-400/20 transition-colors">
              Visit <ExternalLink className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (ad.externalLink) {
    return (
      <a
        href={ad.externalLink}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full"
        tabIndex={active ? 0 : -1}
      >
        {content}
      </a>
    );
  }

  return <div className="w-full h-full">{content}</div>;
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ active, duration }: { active: boolean; duration: number }) {
  return (
    <div className="h-0.5 w-full bg-white/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-400 rounded-full"
        style={{
          width: active ? "100%" : "0%",
          transition: active ? `width ${duration}ms linear` : "none",
        }}
      />
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────────────

const ROTATE_MS = 6000;

export function DashboardAdSection() {
  const { data: ads = [] } = useGetActiveAdvertisements({
    query: { refetchInterval: 60_000, retry: false },
  });

  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback(
    (next: number, dir: "left" | "right" = "right") => {
      if (animating || ads.length <= 1) return;
      setSlideDir(dir);
      setAnimating(true);
      setTimeout(() => {
        setIndex(next);
        setAnimating(false);
      }, 350);
    },
    [animating, ads.length]
  );

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % ads.length;
        setSlideDir("right");
        return next;
      });
    }, ROTATE_MS);
  }, [ads.length]);

  useEffect(() => {
    if (ads.length > 1) startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ads.length, startTimer]);

  useEffect(() => {
    if (index >= ads.length && ads.length > 0) setIndex(0);
  }, [ads.length, index]);

  const navigate = (dir: 1 | -1) => {
    const next = (index + dir + ads.length) % ads.length;
    goTo(next, dir === 1 ? "right" : "left");
    startTimer();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    navigate(dx < 0 ? 1 : -1);
  };

  if (ads.length === 0) return null;

  const ad = ads[index] ?? ads[0];

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone className="w-4 h-4 text-green-500" />
        <span className="text-xs font-semibold uppercase tracking-widest text-green-500">
          Sponsored
        </span>
        {ads.length > 1 && (
          <span className="text-xs text-slate-600 ml-auto tabular-nums">
            {index + 1} / {ads.length}
          </span>
        )}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
        style={{ aspectRatio: "21/7", minHeight: "120px", maxHeight: "240px" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="absolute inset-0 transition-opacity duration-350"
          style={{ opacity: animating ? 0 : 1, transition: "opacity 350ms ease" }}
        >
          <AdSlide ad={ad} active={!animating} direction={slideDir} />
        </div>

        {ads.length > 1 && (
          <>
            <button
              onClick={() => navigate(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 transition-colors backdrop-blur-sm"
              aria-label="Previous advertisement"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 transition-colors backdrop-blur-sm"
              aria-label="Next advertisement"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {ads.length > 1 && (
        <div className="flex items-center gap-1.5 mt-2.5">
          {ads.map((_, i) => (
            <button
              key={i}
              onClick={() => { goTo(i, i > index ? "right" : "left"); startTimer(); }}
              className="transition-all duration-300"
              aria-label={`Go to advertisement ${i + 1}`}
            >
              {i === index ? (
                <div className="h-1.5 w-6 rounded-full bg-green-500" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-slate-600 hover:bg-slate-400 transition-colors" />
              )}
            </button>
          ))}
          <div className="flex-1 ml-2">
            <ProgressBar active={!animating} duration={ROTATE_MS} />
          </div>
        </div>
      )}
    </div>
  );
}
