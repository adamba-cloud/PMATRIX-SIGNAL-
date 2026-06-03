import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Gift,
  Copy,
  Check,
  TrendingUp,
  Trophy,
  Medal,
  Award,
  Star,
} from "lucide-react";
import { format } from "date-fns";

type ReferralStats = {
  referralCode: string;
  totalReferrals: number;
  rewardedCount: number;
  totalBonusDays: number;
  refereeBonusDays?: number;
  referrerBonusDays?: number;
  myRank: number | null;
  totalReferrers: number;
  leaderboard: {
    rank: number;
    name: string;
    isMe: boolean;
    totalReferrals: number;
    totalBonusDaysEarned: number;
  }[];
  referrals: Array<{ id: number; status: string; bonusDays: number; createdAt: string }>;
};

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-400" />;
  if (rank === 3) return <Award className="w-4 h-4 text-amber-600" />;
  return <span className="text-xs font-bold text-muted-foreground w-4 text-center">{rank}</span>;
}

function rankLabel(rank: number): string {
  if (rank === 1) return "🏆 #1";
  if (rank === 2) return "🥈 #2";
  if (rank === 3) return "🥉 #3";
  return `#${rank}`;
}

export default function Profile() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const [editing, setEditing] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: referralStats } = useQuery<ReferralStats>({
    queryKey: ["referral-stats"],
    queryFn: () => customFetch<ReferralStats>("/api/referral/stats"),
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

  const shareLink = referralStats
    ? `${window.location.origin}/register?ref=${referralStats.referralCode}`
    : "";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Info */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">Name</p>
              <p className="font-medium">{user.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">Role</p>
              <Badge variant={user.role === "ADMIN" ? "default" : "secondary"} className="text-xs">
                {user.role}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">Member Since</p>
              <p className="font-medium">
                {user.createdAt ? format(new Date(user.createdAt), "MMM d, yyyy") : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Signal Alerts */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">WhatsApp Signal Alerts</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add your WhatsApp number to receive trading signals directly on your phone.
          </p>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp Number</Label>
                <Input
                  id="whatsapp"
                  placeholder="254712345678"
                  value={whatsappInput}
                  onChange={(e) => setWhatsappInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use international format without + (e.g. 254712345678)
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => saveMutation.mutate(whatsappInput)}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                {user.whatsappNumber ? (
                  <>
                    <p className="font-medium">+{user.whatsappNumber}</p>
                    <p className="text-xs text-green-500 mt-0.5">Alerts enabled</p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No number set</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWhatsappInput(user.whatsappNumber ?? "");
                  setEditing(true);
                }}
              >
                {user.whatsappNumber ? "Change" : "Add Number"}
              </Button>
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
              {/* Your rank banner — shown once they have referrals */}
              {referralStats.myRank !== null && (
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    referralStats.myRank === 1
                      ? "bg-yellow-500/10 border-yellow-500/30"
                      : referralStats.myRank === 2
                      ? "bg-slate-400/10 border-slate-400/30"
                      : referralStats.myRank === 3
                      ? "bg-amber-600/10 border-amber-600/30"
                      : "bg-green-500/10 border-green-500/20"
                  }`}
                >
                  <Star className={`w-5 h-5 flex-shrink-0 ${
                    referralStats.myRank === 1 ? "text-yellow-400" : "text-green-400"
                  }`} />
                  <div>
                    <p className="text-sm font-semibold">
                      You are ranked{" "}
                      <span className={referralStats.myRank <= 3 ? "text-yellow-400" : "text-green-400"}>
                        {rankLabel(referralStats.myRank)}
                      </span>{" "}
                      out of {referralStats.totalReferrers} referrer{referralStats.totalReferrers !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">Keep referring friends to climb higher!</p>
                  </div>
                </div>
              )}

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

              {/* Leaderboard */}
              {referralStats.leaderboard.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Top Referrers
                  </p>
                  <div className="space-y-1.5">
                    {referralStats.leaderboard.map((entry) => (
                      <div
                        key={entry.rank}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          entry.isMe
                            ? "bg-green-500/10 border-green-500/30 ring-1 ring-green-500/20"
                            : "bg-background border-border"
                        }`}
                      >
                        {/* Rank icon */}
                        <div className="flex items-center justify-center w-6 flex-shrink-0">
                          <RankIcon rank={entry.rank} />
                        </div>

                        {/* Name */}
                        <span className={`flex-1 font-medium truncate ${entry.isMe ? "text-green-400" : ""}`}>
                          {entry.name}
                          {entry.isMe && (
                            <span className="ml-1.5 text-xs text-green-500 font-normal">(you)</span>
                          )}
                        </span>

                        {/* Stats */}
                        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                          <span>{entry.totalReferrals} referral{entry.totalReferrals !== 1 ? "s" : ""}</span>
                          <span className="text-green-400 font-medium">+{entry.totalBonusDaysEarned}d</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
