import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Trash2,
  Upload,
  ImageIcon,
  VideoIcon,
  Newspaper,
  BookOpen,
  Edit,
  ExternalLink,
  Globe,
  Send,
  Youtube,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaItem = {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string;
  mimeType: string;
  mediaType: string;
  createdAt: string;
};

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

type ResourceLink = {
  id: number;
  title: string;
  description: string | null;
  url: string;
  linkType: string;
  createdAt: string;
};

function getApiBase() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  return base.replace(/\/[^/]*$/, "") || "";
}

function getAuthHeader() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Media Tab ───────────────────────────────────────────────────────────────

function MediaTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: "", description: "", mediaType: "TRADING_IMAGE" });
  const [delId, setDelId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: items = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ["admin-media"],
    queryFn: () => customFetch("/api/media"),
  });

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast({ title: "Select a file first", variant: "destructive" }); return; }
    if (!form.title.trim()) { toast({ title: "Enter a title", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title);
      fd.append("description", form.description);
      fd.append("mediaType", form.mediaType);
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/media`, {
        method: "POST",
        headers: getAuthHeader(),
        body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Upload failed"); }
      toast({ title: "Media uploaded successfully" });
      setForm({ title: "", description: "", mediaType: "TRADING_IMAGE" });
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["admin-media"] });
      qc.invalidateQueries({ queryKey: ["media"] });
    } catch (e: unknown) {
      toast({ title: "Upload failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/media/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-media"] });
      qc.invalidateQueries({ queryKey: ["media"] });
      toast({ title: "Media deleted" });
    },
  });

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50 flex items-center gap-2">
            <Upload className="w-5 h-5 text-green-500" /> Upload Media
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Title *</label>
              <Input
                placeholder="e.g. EUR/USD Weekly Analysis"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="bg-slate-950 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Media Type *</label>
              <select
                value={form.mediaType}
                onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value }))}
                className="w-full h-10 px-3 rounded-md bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-green-500"
              >
                <option value="TRADING_IMAGE">Trading Image</option>
                <option value="TRADING_VIDEO">Trading Video</option>
                <option value="EDUCATIONAL_VIDEO">Educational Video</option>
                <option value="MARKET_ANALYSIS_IMAGE">Market Analysis Image</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Description</label>
            <Input
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="bg-slate-950 border-slate-700 text-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">File *</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              capture="environment"
              className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-green-500/20 file:text-green-400 file:text-sm file:font-medium hover:file:bg-green-500/30 cursor-pointer"
            />
            <p className="text-xs text-slate-600">JPG, PNG, WEBP, MP4, MOV, WEBM · Max 100 MB</p>
          </div>
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="bg-green-600 hover:bg-green-500 text-white"
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50">Uploaded Media ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-green-500 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No media uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => {
                const isVid = item.mimeType.startsWith("video/");
                const src = `${getApiBase()}${item.fileUrl}`;
                return (
                  <div key={item.id} className="rounded-lg overflow-hidden bg-slate-950 border border-slate-800 group">
                    <div className="aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
                      {isVid ? (
                        <div className="flex flex-col items-center text-slate-500">
                          <VideoIcon className="w-10 h-10 mb-2" />
                          <span className="text-xs">Video</span>
                        </div>
                      ) : (
                        <img src={src} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{item.title}</p>
                        <p className="text-xs text-slate-500">{format(new Date(item.createdAt), "MMM dd, yyyy")}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                        onClick={() => setDelId(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={delId !== null} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-50">Delete Media?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">This will permanently remove the file.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={() => { if (delId) deleteMut.mutate(delId); setDelId(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── News Tab ─────────────────────────────────────────────────────────────────

function NewsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const imgRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [form, setForm] = useState({ title: "", summary: "", content: "", published: false, publishDate: "" });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<number | null>(null);

  const { data: items = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: ["admin-news"],
    queryFn: () => customFetch("/api/admin/news"),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", summary: "", content: "", published: false, publishDate: "" });
    setOpen(true);
  };

  const openEdit = (item: NewsItem) => {
    setEditing(item);
    setForm({
      title: item.title,
      summary: item.summary,
      content: item.content,
      published: item.published,
      publishDate: item.publishDate ? item.publishDate.slice(0, 10) : "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) {
      toast({ title: "Title, summary and content are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("summary", form.summary);
      fd.append("content", form.content);
      fd.append("published", String(form.published));
      if (form.publishDate) fd.append("publishDate", form.publishDate);
      const imgFile = imgRef.current?.files?.[0];
      if (imgFile) fd.append("featuredImage", imgFile);

      const apiBase = getApiBase();
      const url = editing
        ? `${apiBase}/api/admin/news/${editing.id}`
        : `${apiBase}/api/admin/news`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: getAuthHeader(),
        body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Save failed"); }
      toast({ title: editing ? "News updated" : "News created" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-news"] });
      qc.invalidateQueries({ queryKey: ["news"] });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/news/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-news"] });
      qc.invalidateQueries({ queryKey: ["news"] });
      toast({ title: "News deleted" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openNew} className="bg-green-600 hover:bg-green-500 text-white">
          <Plus className="w-4 h-4 mr-2" /> New Article
        </Button>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle className="text-slate-50">All Articles ({items.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-green-500 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No news articles yet.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-950 border border-slate-800 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-200 truncate">{item.title}</p>
                      <Badge variant="outline" className={`text-xs ${item.published ? "border-green-500/40 text-green-400" : "border-slate-600 text-slate-500"}`}>
                        {item.published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{format(new Date(item.createdAt), "MMM dd, yyyy")}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100" onClick={() => openEdit(item)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => setDelId(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-50">{editing ? "Edit Article" : "New Article"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Title *</label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="bg-slate-950 border-slate-700 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Summary *</label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-700 text-slate-200 text-sm resize-none focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Content *</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={8}
                className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-700 text-slate-200 text-sm resize-none focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Featured Image</label>
                <input ref={imgRef} type="file" accept="image/*" className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-800 file:text-slate-300 file:text-xs cursor-pointer" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Publish Date</label>
                <Input type="date" value={form.publishDate} onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))} className="bg-slate-950 border-slate-700 text-slate-200" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} className="w-4 h-4 accent-green-500" />
              <span className="text-sm text-slate-300">Publish immediately</span>
            </label>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editing ? "Save Changes" : "Create Article"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delId !== null} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-50">Delete Article?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-500" onClick={() => { if (delId) deleteMut.mutate(delId); setDelId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Resources Tab ───────────────────────────────────────────────────────────

const LINK_TYPE_ICONS: Record<string, React.ElementType> = {
  YOUTUBE: Youtube,
  WEBSITE: Globe,
  TELEGRAM: Send,
  EDUCATIONAL: BookOpen,
};

function ResourcesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceLink | null>(null);
  const [form, setForm] = useState({ title: "", description: "", url: "", linkType: "WEBSITE" });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<number | null>(null);

  const { data: items = [], isLoading } = useQuery<ResourceLink[]>({
    queryKey: ["admin-resources"],
    queryFn: () => customFetch("/api/resources"),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", description: "", url: "", linkType: "WEBSITE" });
    setOpen(true);
  };

  const openEdit = (item: ResourceLink) => {
    setEditing(item);
    setForm({ title: item.title, description: item.description ?? "", url: item.url, linkType: item.linkType });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.url.trim()) {
      toast({ title: "Title and URL are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const apiBase = getApiBase();
      const url = editing
        ? `${apiBase}/api/admin/resources/${editing.id}`
        : `${apiBase}/api/admin/resources`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Save failed"); }
      toast({ title: editing ? "Resource updated" : "Resource added" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-resources"] });
      qc.invalidateQueries({ queryKey: ["resources"] });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/resources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-resources"] });
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast({ title: "Resource deleted" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openNew} className="bg-green-600 hover:bg-green-500 text-white">
          <Plus className="w-4 h-4 mr-2" /> Add Resource
        </Button>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle className="text-slate-50">All Resources ({items.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-green-500 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No resources added yet.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const TypeIcon = LINK_TYPE_ICONS[item.linkType] ?? Globe;
                return (
                  <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-950 border border-slate-800 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <TypeIcon className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-200 truncate">{item.title}</p>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-400 hover:underline flex items-center gap-1 truncate">
                          {item.url} <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100" onClick={() => openEdit(item)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => setDelId(item.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-50">{editing ? "Edit Resource" : "Add Resource"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Title *</label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="bg-slate-950 border-slate-700 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">URL *</label>
              <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." className="bg-slate-950 border-slate-700 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Type</label>
              <select value={form.linkType} onChange={(e) => setForm((f) => ({ ...f, linkType: e.target.value }))} className="w-full h-10 px-3 rounded-md bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-green-500">
                <option value="YOUTUBE">YouTube</option>
                <option value="WEBSITE">Website</option>
                <option value="TELEGRAM">Telegram</option>
                <option value="EDUCATIONAL">Educational</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-700 text-slate-200 text-sm resize-none focus:outline-none focus:border-green-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editing ? "Save Changes" : "Add Resource"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delId !== null} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-50">Delete Resource?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-500" onClick={() => { if (delId) deleteMut.mutate(delId); setDelId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminContent() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Content Management</h2>
        <p className="text-slate-400">Manage media, trading news, and learning resources.</p>
      </div>

      <Tabs defaultValue="media" className="space-y-6">
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="media" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <ImageIcon className="w-4 h-4 mr-2" /> Media
          </TabsTrigger>
          <TabsTrigger value="news" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <Newspaper className="w-4 h-4 mr-2" /> News
          </TabsTrigger>
          <TabsTrigger value="resources" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <BookOpen className="w-4 h-4 mr-2" /> Resources
          </TabsTrigger>
        </TabsList>

        <TabsContent value="media"><MediaTab /></TabsContent>
        <TabsContent value="news"><NewsTab /></TabsContent>
        <TabsContent value="resources"><ResourcesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
