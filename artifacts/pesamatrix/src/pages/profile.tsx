import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, User as UserIcon, Mail, Shield, Calendar,
  Phone, Save, Gift, Copy, Check, TrendingUp,
} from "lucide-react";
import { format } from "date-fns";

type ReferralStats = {
  referralCode: string;
  totalReferrals: number;
  rewardedCount: number;
  totalBonusDays: number;
  referrals: Array<{ id: number; status: string; bonusDays: number; createdAt: string }>;
};

export default function Profile() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: referralStats } = useQuery<ReferralStats & { refereeBonusDays?: number; referrerBonusDays?: number }>({
    queryKey: ["referral-stats"],
    queryFn: () => customFetch<ReferralStats & { refereeBonusDays?: number; referrerBonusDays?: number }>("/api/referral/stats"),
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: (whatsappNumber: string) =>
      customFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ whatsappNumber: whatsappNumber || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setEditing(false);
      toast({ title: "WhatsApp number saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const copyCode = () => {
    if (!referralStats?.referralCode) return;
    navigator.clipboard.writeText(referralStats.referralCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const copyLink = () => {
    if (!referralStats?.referralCode) return;
    const link = `${window.location.origin}/register?ref=${referralStats.referralCode}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const currentWhatsapp = (user as any).whatsappNumber ?? "";
  const shareLink = referralStats
    ? `${window.location.origin}/register?ref=${referralStats.referralCode}`
    : "";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">View your account details and preferences.</p>
      </div>

      {/* Account Info */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border pb-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 border border-green-500/30">
              <UserIcon className="w-8 h-8" />
            </div>
            <div>
              <CardTitle className="text-2xl text-foreground">{user.name}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="border-green-500 text-green-500 bg-green-500/10">
                  {user.role}
                </Badge>
                <span className="text-sm text-muted-foreground">ID: #{user.id}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-background border border-border">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email Address</p>
                <p className="text-sm font-medium mt-1">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-background border border-border">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Security</p>
                <p className="text-sm font-medium mt-1">
                  {user.mustChangePassword ? "Password Change Required" : "Password Secured"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-background border border-border md:col-span-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Member Since</p>
                <p className="text-sm font-medium mt-1">
                  {format(new Date(user.createdAt), "MMMM dd, yyyy")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Alerts */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-5 h-5 text-green-500" />
            WhatsApp Signal Alerts
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Add your WhatsApp number to receive trading signals directly on WhatsApp.
          </p>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="flex items-center justify-between p-4 rounded-lg bg-background border border-border">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">WhatsApp Number</p>
                {currentWhatsapp ? (
                  <p className="text-sm font-medium text-green-500">+{currentWhatsapp}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not set</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setWhatsapp(currentWhatsapp); setEditing(true); }}
                className="border-border"
              >
                {currentWhatsapp ? "Update" : "Add Number"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  WhatsApp Number (with country code, no +)
                </label>
                <Input
                  placeholder="e.g. 254712345678"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))}
                  className="bg-background border-border"
                />
                <p className="text-xs text-muted-foreground mt-1">Format: 254XXXXXXXXX for Kenya</p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => saveMutation.mutate(whatsapp)}
                  disabled={saveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <><Save className="w-4 h-4 mr-1" /> Save</>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="border-border">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referral Program */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gift className="w-5 h-5 text-green-500" />
            Referral Program
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Invite friends — they get{" "}
            <strong className="text-foreground">{referralStats?.refereeBonusDays ?? "…"} free days</strong>, you earn{" "}
            <strong className="text-foreground">{referralStats?.referrerBonusDays ?? "…"} bonus days</strong> per referral.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!referralStats ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-green-500" />
            </div>
          ) : (
            <>
              {/* Code */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-background border border-border">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Your Referral Code</p>
                  <p className="font-mono text-2xl font-bold text-green-500 tracking-widest">
                    {referralStats.referralCode}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={copyCode} className="border-border gap-1.5">
                  {codeCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {codeCopied ? "Copied" : "Copy Code"}
                </Button>
              </div>

              {/* Share link */}
              <div className="flex items-center gap-2 p-4 rounded-lg bg-background border border-border">
                <input
                  readOnly
                  value={shareLink}
                  className="flex-1 min-w-0 bg-transparent text-xs text-muted-foreground outline-none truncate"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  className="border-border gap-1.5 flex-shrink-0"
                >
                  {linkCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {linkCopied ? "Copied!" : "Copy Link"}
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-background border border-border text-center">
                  <p className="text-3xl font-bold">{referralStats.totalReferrals}</p>
                  <p className="text-xs text-muted-foreground mt-1">Friends Referred</p>
                </div>
                <div className="p-4 rounded-lg bg-background border border-border text-center">
                  <p className="text-3xl font-bold text-green-500">+{referralStats.totalBonusDays}</p>
                  <p className="text-xs text-muted-foreground mt-1">Bonus Days Earned</p>
                </div>
              </div>

              {/* Referral history */}
              {referralStats.referrals.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">History</p>
                  <div className="space-y-1">
                    {referralStats.referrals.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-background border border-border text-sm">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-muted-foreground">
                            {format(new Date(r.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-500 font-medium">+{r.bonusDays} days</span>
                          <Badge variant="secondary" className="text-xs py-0">
                            {r.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
