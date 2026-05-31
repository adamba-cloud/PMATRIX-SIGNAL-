import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { X, AlertTriangle, Info, CheckCircle, AlertCircle } from "lucide-react";
import { useState } from "react";

type AnnouncementType = "INFO" | "WARNING" | "SUCCESS" | "CRITICAL";

type Announcement = {
  id: number;
  title: string;
  message: string;
  type: AnnouncementType;
};

const TYPE_CONFIG: Record<AnnouncementType, {
  icon: React.ElementType;
  bg: string;
  text: string;
}> = {
  INFO: { icon: Info, bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400" },
  WARNING: { icon: AlertTriangle, bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-400" },
  SUCCESS: { icon: CheckCircle, bg: "bg-green-500/15 border-green-500/30", text: "text-green-400" },
  CRITICAL: { icon: AlertCircle, bg: "bg-red-500/15 border-red-500/30", text: "text-red-400" },
};

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("pesa_dismissed_ann") || "[]");
    } catch {
      return [];
    }
  });

  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ["announcements-active"],
    queryFn: () => customFetch("/api/announcements/active").then((r) => r.json()),
    refetchInterval: 60_000,
    retry: false,
  });

  const dismiss = (id: number) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem("pesa_dismissed_ann", JSON.stringify(next));
    } catch {}
  };

  const visible = announcements.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((a) => {
        const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.INFO;
        const Icon = cfg.icon;
        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 px-4 py-2.5 border-b text-sm ${cfg.bg} ${cfg.text}`}
          >
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">{a.title}:</span>{" "}
              <span className="opacity-90">{a.message}</span>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
