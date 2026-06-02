import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminAdvertisements,
  useGetAdminAdvertisementSettings,
  useUpdateAdvertisementSettings,
  useApproveAdvertisement,
  useRejectAdvertisement,
  usePauseAdvertisement,
  useDeleteAdvertisement,
  getAdminAdsQueryKey,
  getAdminAdSettingsQueryKey,
  type AdStatus,
  type Advertisement,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Trash2,
  Clock,
  TimerOff,
  ImageIcon,
  Video,
  Link2,
  Settings,
  ExternalLink,
} from "lucide-react";

const STATUS_CONFIG: Record<AdStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "Pending", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
  APPROVED: { label: "Active", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED: { label: "Rejected", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  PAUSED: { label: "Paused", color: "text-slate-400 bg-slate-500/10 border-slate-500/20", icon: <PauseCircle className="w-3 h-3" /> },
  EXPIRED: { label: "Expired", color: "text-slate-500 bg-slate-800/50 border-slate-700", icon: <TimerOff className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: AdStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function MediaThumb({ ad }: { ad: Advertisement }) {
  if (ad.mediaUrl && ad.mediaType === "IMAGE") {
    return <img src={ad.mediaUrl} alt={ad.title} className="w-20 h-14 object-cover rounded flex-shrink-0" />;
  }
  if (ad.mediaUrl && ad.mediaType === "VIDEO") {
    return <video src={ad.mediaUrl} className="w-20 h-14 object-cover rounded flex-shrink-0" muted />;
  }
  return (
    <div className="w-20 h-14 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
      {ad.mediaType === "VIDEO" ? <Video className="w-5 h-5 text-slate-500" /> :
       ad.mediaType === "LINK" ? <Link2 className="w-5 h-5 text-slate-500" /> :
       <ImageIcon className="w-5 h-5 text-slate-500" />}
    </div>
  );
}

const FILTER_TABS: { label: string; value: AdStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "APPROVED" },
  { label: "Paused", value: "PAUSED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Expired", value: "EXPIRED" },
];

export default function AdminAdvertisements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: ads = [], isLoading } = useGetAdminAdvertisements();
  const { data: settings } = useGetAdminAdvertisementSettings();

  const settingsMutation = useUpdateAdvertisementSettings();
  const approveMutation = useApproveAdvertisement();
  const rejectMutation = useRejectAdvertisement();
  const pauseMutation = usePauseAdvertisement();
  const deleteMutation = useDeleteAdvertisement();

  const [filter, setFilter] = useState<AdStatus | "ALL">("ALL");
  const [feePerDay, setFeePerDay] = useState("");
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getAdminAdsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminAdSettingsQueryKey() });
  };

  const handleOpenSettings = () => {
    setFeePerDay(settings?.feePerDay ?? "100");
    setMinDays(String(settings?.minDays ?? 1));
    setMaxDays(String(settings?.maxDays ?? 90));
    setSettingsOpen(true);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    settingsMutation.mutate(
      { data: { feePerDay: parseFloat(feePerDay), minDays: parseInt(minDays), maxDays: parseInt(maxDays) } },
      {
        onSuccess: () => { toast({ title: "Settings saved" }); invalidate(); setSettingsOpen(false); },
        onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
      }
    );
  };

  const act = (mutation: ReturnType<typeof useApproveAdvertisement>, id: number, successMsg: string) => {
    mutation.mutate({ id }, {
      onSuccess: () => { toast({ title: successMsg }); invalidate(); },
      onError: () => toast({ title: "Action failed", variant: "destructive" }),
    });
  };

  const filtered = filter === "ALL" ? ads : ads.filter((a) => a.status === filter);

  const counts = ads.reduce((acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Advertisements</h2>
          <p className="text-slate-400 mt-1">Review, approve, and manage all platform advertisements.</p>
        </div>
        <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={handleOpenSettings}>
          <Settings className="w-4 h-4 mr-2" /> Ad Settings
        </Button>
      </div>

      {/* Settings Inline Panel */}
      {settingsOpen && (
        <Card className="bg-slate-900 border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-100 text-base">Advertisement Settings</CardTitle>
            <CardDescription className="text-slate-500">Configure pricing and duration limits.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Fee Per Day (KES)</Label>
                <Input value={feePerDay} onChange={(e) => setFeePerDay(e.target.value)} type="number" min="1" step="1"
                  className="bg-slate-800 border-slate-700 text-slate-100 w-36" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Min Days</Label>
                <Input value={minDays} onChange={(e) => setMinDays(e.target.value)} type="number" min="1"
                  className="bg-slate-800 border-slate-700 text-slate-100 w-24" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Max Days</Label>
                <Input value={maxDays} onChange={(e) => setMaxDays(e.target.value)} type="number" min="1"
                  className="bg-slate-800 border-slate-700 text-slate-100 w-24" required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" disabled={settingsMutation.isPending}>
                  {settingsMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Save
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)} className="text-slate-400">Cancel</Button>
              </div>
            </form>
            {settings && (
              <p className="text-xs text-slate-600 mt-3">
                Current: KES {parseFloat(settings.feePerDay).toLocaleString()}/day · {settings.minDays}–{settings.maxDays} days
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {ads.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {FILTER_TABS.filter((t) => t.value !== "ALL").map(({ label, value }) => (
            <Card key={value} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-3 pb-2 px-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-slate-100">{counts[value] ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTER_TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === value
                ? "bg-green-500/10 text-green-400 border border-green-500/30"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
            }`}
          >
            {label}
            {value !== "ALL" && counts[value] ? (
              <span className="ml-1.5 text-xs opacity-70">({counts[value]})</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Ads List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No {filter === "ALL" ? "" : filter.toLowerCase()} advertisements.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((ad) => (
                <div key={ad.id} className="flex items-start gap-4 p-4 rounded-lg bg-slate-900 border border-slate-800">
                  <MediaThumb ad={ad} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{ad.title}</p>
                        {ad.description && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-sm">{ad.description}</p>}
                      </div>
                      <StatusBadge status={ad.status} />
                    </div>

                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                      <span>User #{ad.userId}</span>
                      <span className="capitalize">{ad.mediaType.toLowerCase()}</span>
                      <span>{ad.totalDays} days · KES {parseFloat(ad.totalAmount).toLocaleString()}</span>
                      {ad.startDate && <span>From {new Date(ad.startDate).toLocaleDateString()}</span>}
                      {ad.endDate && <span>To {new Date(ad.endDate).toLocaleDateString()}</span>}
                      <span>Submitted {new Date(ad.createdAt).toLocaleDateString()}</span>
                      {ad.externalLink && (
                        <a href={ad.externalLink} target="_blank" rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300 flex items-center gap-0.5">
                          <ExternalLink className="w-3 h-3" /> Visit Link
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {ad.status === "PENDING" && (
                      <>
                        <Button size="sm" variant="ghost"
                          className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          onClick={() => act(approveMutation, ad.id, "Advertisement approved")}
                          disabled={approveMutation.isPending}
                          title="Approve">
                          {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => act(rejectMutation, ad.id, "Advertisement rejected")}
                          disabled={rejectMutation.isPending}
                          title="Reject">
                          {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        </Button>
                      </>
                    )}
                    {(ad.status === "APPROVED" || ad.status === "PAUSED") && (
                      <Button size="sm" variant="ghost"
                        className="h-8 px-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                        onClick={() => act(pauseMutation, ad.id, ad.status === "PAUSED" ? "Advertisement resumed" : "Advertisement paused")}
                        disabled={pauseMutation.isPending}
                        title={ad.status === "PAUSED" ? "Resume" : "Pause"}>
                        {pauseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> :
                          ad.status === "PAUSED" ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-500 hover:text-red-400" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-slate-900 border-slate-700">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-slate-50">Delete Advertisement</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            This will permanently delete "{ad.title}" and its media file.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate({ id: ad.id }, {
                              onSuccess: () => { toast({ title: "Advertisement deleted" }); invalidate(); },
                              onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
                            })}
                            disabled={deleteMutation.isPending}
                            className="bg-red-600 hover:bg-red-700 text-white">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
