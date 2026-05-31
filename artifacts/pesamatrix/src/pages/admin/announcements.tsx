import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Megaphone, ToggleLeft, ToggleRight } from "lucide-react";
import { format } from "date-fns";

type AnnouncementType = "INFO" | "WARNING" | "SUCCESS" | "CRITICAL";

type Announcement = {
  id: number;
  title: string;
  message: string;
  type: AnnouncementType;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
};

const TYPE_COLORS: Record<AnnouncementType, string> = {
  INFO: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  WARNING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  SUCCESS: "bg-green-500/10 text-green-400 border-green-500/30",
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function AdminAnnouncements() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "INFO" as AnnouncementType,
    expiresAt: "",
  });

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["admin-announcements"],
    queryFn: () => customFetch<Announcement[]>("/api/admin/announcements"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      customFetch<Announcement>("/api/admin/announcements", {
        method: "POST",
        body: JSON.stringify({ ...data, expiresAt: data.expiresAt || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements-active"] });
      setShowCreate(false);
      setForm({ title: "", message: "", type: "INFO", expiresAt: "" });
      toast({ title: "Announcement published" });
    },
    onError: () => toast({ title: "Failed to create", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch<Announcement>(`/api/admin/announcements/${id}/toggle`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements-active"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/admin/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements-active"] });
      setDeleteId(null);
      toast({ title: "Announcement deleted" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Announcements</h2>
          <p className="text-muted-foreground">Broadcast messages to all logged-in users.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> New Announcement
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-green-500" />
        </div>
      ) : announcements.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Megaphone className="w-10 h-10 mb-3 opacity-40" />
            <p>No announcements yet. Create one to broadcast to users.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <Card key={ann.id} className={`bg-card border-border ${!ann.active ? "opacity-50" : ""}`}>
              <CardContent className="flex items-start gap-4 pt-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-foreground">{ann.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_COLORS[ann.type]}`}>
                      {ann.type}
                    </span>
                    <Badge variant={ann.active ? "default" : "secondary"} className="text-xs">
                      {ann.active ? "Active" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{ann.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {format(new Date(ann.createdAt), "MMM d, yyyy HH:mm")}
                    {ann.expiresAt && ` · Expires ${format(new Date(ann.expiresAt), "MMM d, yyyy")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleMutation.mutate(ann.id)}
                    disabled={toggleMutation.isPending}
                    className="text-muted-foreground hover:text-foreground"
                    title={ann.active ? "Hide announcement" : "Show announcement"}
                  >
                    {ann.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(ann.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Title</label>
              <Input
                placeholder="e.g. Market Closed Today"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="bg-background border-border"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Message</label>
              <textarea
                placeholder="Your announcement message..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Type</label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AnnouncementType })}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFO">ℹ️ Info</SelectItem>
                  <SelectItem value="SUCCESS">✅ Success</SelectItem>
                  <SelectItem value="WARNING">⚠️ Warning</SelectItem>
                  <SelectItem value="CRITICAL">🚨 Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Expires (optional)
              </label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="bg-background border-border"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.title || !form.message || createMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
