import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ImageIcon, VideoIcon, X, PlayCircle } from "lucide-react";

type MediaItem = {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string;
  mimeType: string;
  mediaType: string;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  TRADING_IMAGE: "Trading",
  TRADING_VIDEO: "Trading",
  EDUCATIONAL_VIDEO: "Education",
  MARKET_ANALYSIS_IMAGE: "Analysis",
};

function isVideo(mimeType: string) {
  return mimeType.startsWith("video/");
}

function getApiBase() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  return base.replace(/\/[^/]*$/, "") || "";
}

function MediaCard({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const video = isVideo(item.mimeType);
  const src = `${getApiBase()}${item.fileUrl}`;

  return (
    <div
      className="group relative cursor-pointer rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-green-500/50 transition-all"
      onClick={onClick}
    >
      <div className="aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
        {video ? (
          <div className="relative w-full h-full">
            <video
              src={src}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
              <PlayCircle className="w-12 h-12 text-white opacity-80" />
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-200 truncate">{item.title}</p>
          <Badge variant="outline" className="text-xs border-green-500/40 text-green-400 whitespace-nowrap">
            {TYPE_LABELS[item.mediaType] ?? item.mediaType}
          </Badge>
        </div>
        {item.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
        )}
      </div>
    </div>
  );
}

function LightboxModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const video = isVideo(item.mimeType);
  const src = `${getApiBase()}${item.fileUrl}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white"
        onClick={onClose}
      >
        <X className="w-8 h-8" />
      </button>
      <div
        className="max-w-5xl w-full max-h-[90vh] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center max-h-[75vh]">
          {video ? (
            <video
              src={src}
              controls
              autoPlay
              className="max-w-full max-h-[75vh] w-full"
            />
          ) : (
            <img
              src={src}
              alt={item.title}
              className="max-w-full max-h-[75vh] object-contain"
            />
          )}
        </div>
        <div className="bg-slate-900 rounded-xl p-4">
          <p className="font-semibold text-slate-100">{item.title}</p>
          {item.description && (
            <p className="text-sm text-slate-400 mt-1">{item.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Gallery() {
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [filter, setFilter] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");

  const { data, isLoading } = useQuery<MediaItem[]>({
    queryKey: ["media"],
    queryFn: () => customFetch("/api/media"),
  });

  const filtered = (data ?? []).filter((item) => {
    if (filter === "IMAGE") return !isVideo(item.mimeType);
    if (filter === "VIDEO") return isVideo(item.mimeType);
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Media Gallery</h2>
        <p className="text-slate-400">Trading images, videos and market analysis.</p>
      </div>

      <div className="flex gap-2">
        {(["ALL", "IMAGE", "VIDEO"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-green-500/20 text-green-400 border border-green-500/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-600"
            }`}
          >
            {f === "IMAGE" && <ImageIcon className="w-4 h-4" />}
            {f === "VIDEO" && <VideoIcon className="w-4 h-4" />}
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ImageIcon className="w-12 h-12 text-slate-700 mb-4" />
            <p className="text-slate-400">No media available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <MediaCard key={item.id} item={item} onClick={() => setSelected(item)} />
          ))}
        </div>
      )}

      {selected && <LightboxModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
