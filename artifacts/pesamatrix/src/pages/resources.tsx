import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, ExternalLink, Youtube, Globe, Send } from "lucide-react";

type ResourceLink = {
  id: number;
  title: string;
  description: string | null;
  url: string;
  linkType: "YOUTUBE" | "WEBSITE" | "TELEGRAM" | "EDUCATIONAL";
  createdAt: string;
};

const TYPE_CONFIG = {
  YOUTUBE: { label: "YouTube", icon: Youtube, color: "text-red-400 border-red-500/30 bg-red-500/10" },
  WEBSITE: { label: "Website", icon: Globe, color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  TELEGRAM: { label: "Telegram", icon: Send, color: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  EDUCATIONAL: { label: "Educational", icon: BookOpen, color: "text-green-400 border-green-500/30 bg-green-500/10" },
} as const;

function ResourceCard({ item }: { item: ResourceLink }) {
  const config = TYPE_CONFIG[item.linkType] ?? TYPE_CONFIG.WEBSITE;
  const TypeIcon = config.icon;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <Card className="bg-slate-900 border-slate-800 hover:border-green-500/40 transition-all h-full">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-3">
            <div className={`p-2 rounded-lg border ${config.color}`}>
              <TypeIcon className="w-5 h-5" />
            </div>
            <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-green-400 transition-colors mt-1" />
          </div>

          <div className="flex-1 space-y-1">
            <h3 className="font-semibold text-slate-100 group-hover:text-green-400 transition-colors leading-tight">
              {item.title}
            </h3>
            {item.description && (
              <p className="text-sm text-slate-400 line-clamp-3">{item.description}</p>
            )}
          </div>

          <Badge variant="outline" className={`text-xs self-start ${config.color}`}>
            {config.label}
          </Badge>
        </CardContent>
      </Card>
    </a>
  );
}

export default function Resources() {
  const { data, isLoading } = useQuery<ResourceLink[]>({
    queryKey: ["resources"],
    queryFn: () => customFetch("/api/resources"),
  });

  const byType = (data ?? []).reduce(
    (acc, item) => {
      (acc[item.linkType] ??= []).push(item);
      return acc;
    },
    {} as Record<string, ResourceLink[]>,
  );

  const order: ResourceLink["linkType"][] = ["YOUTUBE", "TELEGRAM", "EDUCATIONAL", "WEBSITE"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Learning Resources</h2>
        <p className="text-slate-400">Curated links for traders — videos, channels, and educational material.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="w-12 h-12 text-slate-700 mb-4" />
            <p className="text-slate-400">No resources added yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {order.map((type) => {
            const items = byType[type];
            if (!items?.length) return null;
            const config = TYPE_CONFIG[type];
            const TypeIcon = config.icon;
            return (
              <div key={type} className="space-y-4">
                <div className="flex items-center gap-2">
                  <TypeIcon className={`w-5 h-5 ${config.color.split(" ")[0]}`} />
                  <h3 className="text-lg font-semibold text-slate-200">{config.label}</h3>
                  <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{items.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((item) => (
                    <ResourceCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
