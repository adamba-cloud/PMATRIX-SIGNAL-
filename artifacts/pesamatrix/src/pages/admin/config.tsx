import { useState, useEffect, useRef } from "react";
import { useGetConfig, getGetConfigQueryKey, useUpdateConfig, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, ImageIcon, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });
  const updateConfigMutation = useUpdateConfig();

  const [feePerDay, setFeePerDay] = useState("");
  const [minDays, setMinDays] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (config && !initialized.current) {
      setFeePerDay(config.feePerDay.toString());
      setMinDays(config.minDays.toString());
      initialized.current = true;
    }
  }, [config]);

  const { data: logoData, isLoading: logoLoading } = useQuery<{ url: string | null }>({
    queryKey: ["logo"],
    queryFn: () => customFetch<{ url: string | null }>("/api/logo"),
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("logo", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/logo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logo"] });
      setLogoFile(null);
      setLogoPreview(null);
      toast({ title: "Logo updated successfully" });
    },
    onError: () => toast({ title: "Logo upload failed", variant: "destructive" }),
  });

  const removeLogoMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/logo", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logo"] });
      toast({ title: "Logo removed" });
    },
    onError: () => toast({ title: "Failed to remove logo", variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfigMutation.mutate(
      { data: { feePerDay: Number(feePerDay), minDays: Number(minDays) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
          toast({ title: "Configuration Saved", description: "System configuration has been updated successfully." });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to update configuration.", variant: "destructive" });
        },
      }
    );
  };

  const currentLogoUrl = logoData?.url
    ? `${logoData.url}?t=${Date.now()}`
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">System Configuration</h2>
        <p className="text-muted-foreground">Manage global settings for the platform.</p>
      </div>

      {/* Logo Upload */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="w-4 h-4 text-green-500" />
            Platform Logo
          </CardTitle>
          <CardDescription>
            Upload a logo to display in the sidebar. PNG, JPG, WebP or SVG, max 5 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current / preview */}
          <div className="flex items-center gap-6">
            <div className="w-32 h-16 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className="max-w-full max-h-full object-contain p-1" />
              ) : currentLogoUrl ? (
                <img src={currentLogoUrl} alt="Current logo" className="max-w-full max-h-full object-contain p-1" />
              ) : (
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <p className="text-xs">No logo</p>
                </div>
              )}
            </div>
            <div className="space-y-2 flex-1">
              <p className="text-sm text-muted-foreground">
                {currentLogoUrl && !logoPreview
                  ? "Logo is currently active in the sidebar."
                  : logoPreview
                  ? "Preview — click Save to apply."
                  : "No logo set. Upload one to replace the text branding."}
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {currentLogoUrl ? "Replace" : "Upload Logo"}
                </Button>
                {currentLogoUrl && !logoPreview && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-red-400 hover:text-red-300 border-red-900/50"
                    onClick={() => removeLogoMutation.mutate()}
                    disabled={removeLogoMutation.isPending}
                  >
                    {removeLogoMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Save / cancel for new file */}
          {logoFile && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 gap-1.5"
                onClick={() => uploadLogoMutation.mutate(logoFile)}
                disabled={uploadLogoMutation.isPending}
              >
                {uploadLogoMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                Save Logo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setLogoFile(null); setLogoPreview(null); }}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Rules */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="w-4 h-4 text-green-500" />
            Pricing Rules
          </CardTitle>
          <CardDescription>These settings affect all new subscriptions.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="feePerDay">Fee Per Day (KES)</Label>
                <Input
                  id="feePerDay"
                  type="number"
                  min="0"
                  value={feePerDay}
                  onChange={(e) => setFeePerDay(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">The daily cost for access to trading signals.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minDays">Minimum Days Required</Label>
                <Input
                  id="minDays"
                  type="number"
                  min="1"
                  value={minDays}
                  onChange={(e) => setMinDays(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">The minimum duration a user must subscribe for.</p>
              </div>
              <Button
                type="submit"
                className="bg-green-600 hover:bg-green-500 text-white border-0"
                disabled={updateConfigMutation.isPending}
              >
                {updateConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Configuration
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
