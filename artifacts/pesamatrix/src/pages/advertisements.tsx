import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyAdvertisements,
  useCreateAdvertisement,
  useGetAdvertisementSettings,
  getMyAdsQueryKey,
  type AdStatus,
  type AdMediaType,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  ImageIcon,
  Video,
  Link2,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  TimerOff,
  Upload,
  ExternalLink,
} from "lucide-react";

const STATUS_CONFIG: Record<AdStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "Pending Review", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
  APPROVED: { label: "Active", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED: { label: "Rejected", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  PAUSED: { label: "Paused", color: "text-slate-400 bg-slate-500/10 border-slate-500/20", icon: <PauseCircle className="w-3 h-3" /> },
  EXPIRED: { label: "Expired", color: "text-slate-500 bg-slate-800/50 border-slate-700", icon: <TimerOff className="w-3 h-3" /> },
};

const MEDIA_TYPE_OPTIONS: { value: AdMediaType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "IMAGE", label: "Image", icon: <ImageIcon className="w-4 h-4" />, desc: "Upload a banner or promotional image" },
  { value: "VIDEO", label: "Video", icon: <Video className="w-4 h-4" />, desc: "Upload an MP4, MOV, or WEBM video" },
  { value: "LINK", label: "Link Only", icon: <Link2 className="w-4 h-4" />, desc: "Text advertisement with external link" },
];

function StatusBadge({ status }: { status: AdStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function Advertisements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useGetAdvertisementSettings();
  const { data: myAds = [], isLoading } = useGetMyAdvertisements();
  const createMutation = useCreateAdvertisement();

  const [showForm, setShowForm] = useState(false);
  const [mediaType, setMediaType] = useState<AdMediaType>("IMAGE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [totalDays, setTotalDays] = useState(7);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const feePerDay = parseFloat(settings?.feePerDay ?? "100");
  const minDays = settings?.minDays ?? 1;
  const maxDays = settings?.maxDays ?? 90;
  const totalCost = feePerDay * totalDays;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setExternalLink(""); setTotalDays(7);
    setFile(null); setPreview(null); setMediaType("IMAGE"); setShowForm(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if ((mediaType === "IMAGE" || mediaType === "VIDEO") && !file) {
      toast({ title: "Please select a file", variant: "destructive" }); return;
    }
    if (mediaType === "LINK" && !externalLink.trim()) {
      toast({ title: "External link is required", variant: "destructive" }); return;
    }

    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("mediaType", mediaType);
    fd.append("externalLink", externalLink.trim());
    fd.append("totalDays", String(totalDays));
    if (file) fd.append("file", file);

    createMutation.mutate({ data: fd }, {
      onSuccess: () => {
        toast({ title: "Advertisement submitted!", description: "It will be reviewed by our team." });
        queryClient.invalidateQueries({ queryKey: getMyAdsQueryKey() });
        resetForm();
      },
      onError: (err) => toast({ title: (err as Error).message, variant: "destructive" }),
    });
  };

  const activeAds = myAds.filter((a) => a.status === "APPROVED");
  const pendingAds = myAds.filter((a) => a.status === "PENDING");
  const expiredAds = myAds.filter((a) => a.status === "EXPIRED" || a.status === "REJECTED");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Advertise With Us</h2>
          <p className="text-slate-400 mt-1">Reach traders and investors on PESAMATRIX SIGNAL.</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Create Advertisement
          </Button>
        )}
      </div>

      {/* Pricing Info */}
      {settings && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Fee Per Day", value: `KES ${feePerDay.toLocaleString()}` },
            { label: "Min Days", value: String(minDays) },
            { label: "Max Days", value: String(maxDays) },
          ].map(({ label, value }) => (
            <Card key={label} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-slate-100">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-slate-100">New Advertisement</CardTitle>
            <CardDescription className="text-slate-500">Fill in the details below. Your ad will be reviewed before going live.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Media Type Selection */}
              <div>
                <Label className="text-slate-300 mb-3 block">Advertisement Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {MEDIA_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setMediaType(opt.value); setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        mediaType === opt.value
                          ? "border-green-500 bg-green-500/10 text-green-400"
                          : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 font-medium text-sm">
                        {opt.icon} {opt.label}
                      </div>
                      <p className="text-xs text-slate-500">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ad-title" className="text-slate-300">Advertisement Title *</Label>
                  <Input
                    id="ad-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Best Forex Broker 2024"
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ad-link" className="text-slate-300">External Link {mediaType === "LINK" ? "*" : "(optional)"}</Label>
                  <Input
                    id="ad-link"
                    value={externalLink}
                    onChange={(e) => setExternalLink(e.target.value)}
                    placeholder="https://example.com"
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    type="url"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ad-desc" className="text-slate-300">Description (optional)</Label>
                <Input
                  id="ad-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short tagline or description"
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>

              {(mediaType === "IMAGE" || mediaType === "VIDEO") && (
                <div className="space-y-2">
                  <Label className="text-slate-300">
                    {mediaType === "IMAGE" ? "Upload Image *" : "Upload Video *"}
                  </Label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-green-500/50 hover:bg-green-500/5 transition-all"
                  >
                    {preview ? (
                      mediaType === "IMAGE" ? (
                        <img src={preview} alt="preview" className="max-h-32 mx-auto rounded object-contain" />
                      ) : (
                        <video src={preview} className="max-h-32 mx-auto rounded" controls />
                      )
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Click to upload {mediaType === "IMAGE" ? "JPG, PNG, WEBP, GIF" : "MP4, MOV, WEBM"}</p>
                        <p className="text-xs text-slate-600 mt-1">Max 100MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={mediaType === "IMAGE" ? "image/*" : "video/*"}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file && <p className="text-xs text-slate-500">{file.name}</p>}
                </div>
              )}

              {/* Days & Cost */}
              <div className="space-y-2">
                <Label htmlFor="ad-days" className="text-slate-300">
                  Number of Days * ({minDays}–{maxDays})
                </Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="ad-days"
                    type="number"
                    min={minDays}
                    max={maxDays}
                    value={totalDays}
                    onChange={(e) => setTotalDays(Math.min(maxDays, Math.max(minDays, parseInt(e.target.value) || minDays)))}
                    className="bg-slate-800 border-slate-700 text-slate-100 w-32"
                  />
                  <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2">
                    <p className="text-xs text-slate-500 mb-0.5">Total Cost</p>
                    <p className="text-xl font-bold text-green-400">KES {totalCost.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  KES {feePerDay.toLocaleString()} × {totalDays} days = KES {totalCost.toLocaleString()}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Submit Advertisement
                </Button>
                <Button type="button" variant="ghost" onClick={resetForm} className="text-slate-400">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* My Ads */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-green-500" />
        </div>
      ) : myAds.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="py-16 text-center">
            <ImageIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-300 font-medium">No advertisements yet</p>
            <p className="text-slate-500 text-sm mt-1">Create your first ad to start reaching PESAMATRIX users.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {([
            { label: "Active Ads", items: activeAds },
            { label: "Pending Review", items: pendingAds },
            { label: "Expired & Rejected", items: expiredAds },
          ] as const).filter(({ items }) => items.length > 0).map(({ label, items }) => (
            <Card key={label} className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-slate-100 text-lg">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {items.map((ad) => (
                    <div key={ad.id} className="flex items-start gap-4 p-4 rounded-lg bg-slate-900 border border-slate-800">
                      {ad.mediaUrl && ad.mediaType === "IMAGE" && (
                        <img src={ad.mediaUrl} alt={ad.title} className="w-20 h-14 object-cover rounded flex-shrink-0" />
                      )}
                      {ad.mediaUrl && ad.mediaType === "VIDEO" && (
                        <video src={ad.mediaUrl} className="w-20 h-14 object-cover rounded flex-shrink-0" muted />
                      )}
                      {ad.mediaType === "LINK" && (
                        <div className="w-20 h-14 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <Link2 className="w-6 h-6 text-slate-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">{ad.title}</p>
                            {ad.description && <p className="text-xs text-slate-500 mt-0.5">{ad.description}</p>}
                          </div>
                          <StatusBadge status={ad.status} />
                        </div>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                          <span>{ad.totalDays} days · KES {parseFloat(ad.totalAmount).toLocaleString()}</span>
                          {ad.startDate && <span>Started {new Date(ad.startDate).toLocaleDateString()}</span>}
                          {ad.endDate && <span>Ends {new Date(ad.endDate).toLocaleDateString()}</span>}
                          {ad.externalLink && (
                            <a href={ad.externalLink} target="_blank" rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300 flex items-center gap-0.5">
                              <ExternalLink className="w-3 h-3" /> Visit Link
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
