import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Newspaper, Search, ArrowLeft, Calendar } from "lucide-react";
import { format } from "date-fns";

type NewsItem = {
  id: number;
  title: string;
  summary: string;
  content: string;
  featuredImageUrl: string | null;
  published: boolean;
  publishDate: string | null;
  createdAt: string;
};

function getApiBase() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  return base.replace(/\/[^/]*$/, "") || "";
}

function NewsCard({ item, onClick }: { item: NewsItem; onClick: () => void }) {
  const imgSrc = item.featuredImageUrl ? `${getApiBase()}${item.featuredImageUrl}` : null;
  const date = item.publishDate ?? item.createdAt;

  return (
    <Card
      className="bg-slate-900 border-slate-800 hover:border-green-500/40 transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      {imgSrc && (
        <div className="h-48 overflow-hidden bg-slate-950">
          <img
            src={imgSrc}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
      )}
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="w-3 h-3" />
          {format(new Date(date), "MMM dd, yyyy")}
        </div>
        <h3 className="font-semibold text-slate-100 text-lg leading-tight group-hover:text-green-400 transition-colors line-clamp-2">
          {item.title}
        </h3>
        <p className="text-sm text-slate-400 line-clamp-3">{item.summary}</p>
        <span className="text-xs text-green-400 font-medium">Read more →</span>
      </CardContent>
    </Card>
  );
}

function NewsDetail({ item, onBack }: { item: NewsItem; onBack: () => void }) {
  const imgSrc = item.featuredImageUrl ? `${getApiBase()}${item.featuredImageUrl}` : null;
  const date = item.publishDate ?? item.createdAt;

  return (
    <div className="space-y-6 max-w-3xl">
      <Button
        variant="ghost"
        className="text-slate-400 hover:text-slate-100 -ml-2"
        onClick={onBack}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to News
      </Button>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Calendar className="w-4 h-4" />
          {format(new Date(date), "MMMM dd, yyyy")}
        </div>
        <h1 className="text-3xl font-bold text-slate-50 leading-tight">{item.title}</h1>
        <p className="text-lg text-slate-400">{item.summary}</p>
      </div>

      {imgSrc && (
        <div className="rounded-xl overflow-hidden border border-slate-800">
          <img src={imgSrc} alt={item.title} className="w-full object-cover" />
        </div>
      )}

      <div
        className="prose prose-invert prose-slate max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap"
      >
        {item.content}
      </div>
    </div>
  );
}

export default function News() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<NewsItem | null>(null);

  const { data, isLoading } = useQuery<NewsItem[]>({
    queryKey: ["news"],
    queryFn: () => customFetch("/api/news"),
  });

  const filtered = (data ?? []).filter(
    (item) =>
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.summary.toLowerCase().includes(search.toLowerCase()),
  );

  if (selected) {
    return <NewsDetail item={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Trading News</h2>
        <p className="text-slate-400">Latest market news and trading insights.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          placeholder="Search news…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:border-green-500"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Newspaper className="w-12 h-12 text-slate-700 mb-4" />
            <p className="text-slate-400">
              {search ? "No news matched your search." : "No news published yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item) => (
            <NewsCard key={item.id} item={item} onClick={() => setSelected(item)} />
          ))}
        </div>
      )}
    </div>
  );
}
