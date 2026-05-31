import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Gift, TrendingUp } from "lucide-react";
import { format } from "date-fns";

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

export default function AdminReferrals() {
  const { data: referrals = [], isLoading } = useQuery<ReferralRow[]>({
    queryKey: ["admin-referrals"],
    queryFn: () => customFetch("/api/admin/referrals").then((r) => r.json()),
  });

  const totalBonusDaysGiven = referrals.reduce(
    (sum, r) => sum + r.refereeBonusDays + r.referrerBonusDays,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Referral Program</h2>
        <p className="text-muted-foreground">Track signups via referral links.</p>
      </div>

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
            <CardTitle className="text-base">All Referrals</CardTitle>
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
                      <span>Referee got +{r.refereeBonusDays}d · Referrer got +{r.referrerBonusDays}d</span>
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
