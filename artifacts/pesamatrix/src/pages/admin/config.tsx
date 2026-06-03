import { useState, useEffect, useRef } from "react";
import { useGetConfig, getGetConfigQueryKey, useUpdateConfig, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, ImageIcon, Trash2, Upload, Mail, Send, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SmtpSettings {
  host: string;
  port: string;
  user: string;
  hasPassword: boolean;
  from: string;
  appUrl: string;
}

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
    mutationFn: () => customFetch("/api/admin/logo", { method: "DELETE" }),
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

  const currentLogoUrl = logoData?.url ? `${logoData.url}?t=${Date.now()}` : null;

  const { data: smtpData, isLoading: smtpLoading } = useQuery<SmtpSettings>({
    queryKey: ["admin-smtp"],
    queryFn: () => customFetch<SmtpSettings>("/api/admin/smtp"),
  });

  const smtpInitialized = useRef(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    if (smtpData && !smtpInitialized.current) {
      setSmtpHost(smtpData.host);
      setSmtpPort(smtpData.port);
      setSmtpUser(smtpData.user);
      setSmtpPass(smtpData.hasPassword ? "••••••••" : "");
      setSmtpFrom(smtpData.from);
      setAppUrl(smtpData.appUrl);
      smtpInitialized.current = true;
    }
  }, [smtpData]);

  const saveSmtpMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/smtp", {
        method: "POST",
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          password: smtpPass,
          from: smtpFrom,
          appUrl,
        }),
      }),
    onSuccess: () => {
      smtpInitialized.current = false;
      queryClient.invalidateQueries({ queryKey: ["admin-smtp"] });
      toast({ title: "SMTP settings saved" });
    },
    onError: (err: any) =>
      toast({ title: "Failed to save SMTP settings", description: err?.message, variant: "destructive" }),
  });

  const testSmtpMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/smtp/test", {
        method: "POST",
        body: JSON.stringify({ email: testEmail }),
      }),
    onSuccess: () =>
      toast({ title: "Test email sent!", description: `Check the inbox at ${testEmail}.` }),
    onError: (err: any) =>
      toast({ title: "Test failed", description: err?.data?.error ?? err?.message, variant: "destructive" }),
  });

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
            Upload a logo to display in the sidebar and auth screens. PNG, JPG, WebP or SVG, max 5 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  ? "Logo is currently active in the sidebar and auth screens."
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

      {/* SMTP Email Settings */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4 text-green-500" />
            Email (SMTP)
          </CardTitle>
          <CardDescription>
            Configure outgoing email for password resets and account verification. Changes take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {smtpLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input
                    id="smtp-host"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                    type="number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp-user">Username / Email</Label>
                <Input
                  id="smtp-user"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="you@gmail.com"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp-pass">Password / App Password</Label>
                <div className="relative">
                  <Input
                    id="smtp-pass"
                    type={showPass ? "text" : "password"}
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    onFocus={() => { if (smtpPass === "••••••••") setSmtpPass(""); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">For Gmail, use an App Password (not your account password).</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp-from">From Address</Label>
                <Input
                  id="smtp-from"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  placeholder="PESAMATRIX <noreply@yourdomain.com>"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-url">App URL</Label>
                <Input
                  id="app-url"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://yourapp.replit.app"
                />
                <p className="text-xs text-muted-foreground">Used to build links inside emails (e.g. reset password link).</p>
              </div>

              <Button
                className="bg-green-600 hover:bg-green-500 text-white border-0"
                onClick={() => saveSmtpMutation.mutate()}
                disabled={saveSmtpMutation.isPending}
              >
                {saveSmtpMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save SMTP Settings
              </Button>

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium">Send a test email</p>
                <p className="text-xs text-muted-foreground">Save your settings above first, then send a test to verify delivery.</p>
                <div className="flex gap-2">
                  <Input
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="your@email.com"
                    type="email"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => testSmtpMutation.mutate()}
                    disabled={testSmtpMutation.isPending || !testEmail}
                  >
                    {testSmtpMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Send Test
                  </Button>
                </div>
              </div>
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
