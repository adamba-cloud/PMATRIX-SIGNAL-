import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Gift, TrendingUp, Settings, Users } from "lucide-react";
import { format } from "date-fns";

type ReferralSettings = {
  refereeBonusDays: number;
  referrerBonusDays: number;
};

type ReferralRow = {
  id: number;
  status: "PENDING" | "REWARDED";
  referrer: { id: number; name: string; email: string };
  referee: { id: number; name: string; email: string };
  refereeBonusDays: number;
  referrerBonusDays: number;
  createdAt: string;
  rewardedAt: string | null;
};

type AdminReferralsResponse = {
  settings: ReferralSettings;
  referrals: ReferralRow[];
};

export default function AdminReferrals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AdminReferralsResponse>({
    queryKey: ["admin-referrals"],
    queryFn: () => customFetch<AdminReferralsResponse>("/api/admin/referrals"),
  });

  const referrals = data?.referrals ?? [];
  const settings = data?.settings;

  const [refereeInput, setRefereeInput] = useState("");
  const [referrerInput, setReferrerInput] = useState("");

  const { mutate: saveSettings, isPending: saving } = useMutation({
    mutationFn: (payload: Partial<ReferralSettings>) =>
      customFetch<ReferralSettings>("/api/admin/referral/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
      toast({ title: "Referral settings updated" });
      setRefereeInput("");
      setReferrerInput("");
    },
    onError: () => toast({ title: "Failed to update settings", variant: "destructive" }),
  });

  const handleSave = () => {
    const payload: Partial<ReferralSettings> = {};
    const rd = parseInt(refereeInput, 10);
    const rr = parseInt(referrerInput, 10);
    if (refereeInput && !isNaN(rd) && rd >= 1) payload.refereeBonusDays = rd;
    if (referrerInput && !isNaN(rr) && rr >= 1) payload.referrerBonusDays = rr;
    if (!Object.keys(payload).length) {
      toast({ title: "Enter at least one value to update", variant: "destructive" });
      return;
    }
    saveSettings(payload);
  };

  const totalBonusDaysGiven = referrals.reduce(
    (sum, r) => sum + r.refereeBonusDays + r.referrerBonusDays,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Referral Program</h2>
        <p className="text-muted-foreground">Configure bonus days and track referral signups.</p>
      </div>

      {/* Settings card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-green-500" />
            Bonus Day Settings
          </CardTitle>
          <CardDescription>
            Currently: New user gets{" "}
            <strong className="text-foreground">{settings?.refereeBonusDays ?? "…"} days</strong>, referrer earns{" "}
            <strong className="text-foreground">{settings?.referrerBonusDays ?? "…"} days</strong> per referral.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label>New User (Referee) Bonus Days</Label>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder={`Current: ${settings?.refereeBonusDays ?? "…"}`}
                value={refereeInput}
                onChange={(e) => setRefereeInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Days given to the person who signs up via a referral link</p>
            </div>
            <div className="space-y-1.5">
              <Label>Referrer Bonus Days</Label>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder={`Current: ${settings?.referrerBonusDays ?? "…"}`}
                value={referrerInput}
                onChange={(e) => setReferrerInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Days given to the user who shared the referral code</p>
            </div>
          </div>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={handleSave}
            disabled={saving || (!refereeInput && !referrerInput)}
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Referrals</p>
            <p className="text-3xl font-bold mt-1">{referrals.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rewarded</p>
            <p className="text-3xl font-bold mt-1 text-green-500">
              {referrals.filter((r) => r.status === "REWARDED").length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Bonus Days Given</p>
            <p className="text-3xl font-bold mt-1">{totalBonusDaysGiven}</p>
          </CardContent>
        </Card>
      </div>

      {/* Referrals table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-green-500" />
        </div>
      ) : referrals.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Gift className="w-10 h-10 mb-3 opacity-40" />
            <p>No referrals yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-green-500" />
              All Referrals
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {referrals.map((r) => (
                <div key={r.id} className="flex items-center gap-4 px-6 py-4">
                  <TrendingUp className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.referrer.name}</span>
                      <span className="text-muted-foreground text-xs">→</span>
                      <span className="font-medium text-sm">{r.referee.name}</span>
                      <Badge variant={r.status === "REWARDED" ? "default" : "secondary"} className="text-xs">
                        {r.status}
                      </Badge>
                    </div>
                    <div className="flex gap-4 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span>{r.referrer.email}</span>
                      <span className="text-green-400 font-medium">
                        Referee +{r.refereeBonusDays}d · Referrer +{r.referrerBonusDays}d
                      </span>
                      <span>{format(new Date(r.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
