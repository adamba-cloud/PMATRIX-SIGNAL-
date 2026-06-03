import { useState } from "react";
import {
  useGetAdminMt5BillingSettings,
  useGetAdminMt5Subscriptions,
  useGetAdminMt5BillingAnalytics,
  useUpdateMt5BillingSettings,
  useAdminGrantMt5Subscription,
  getAdminMt5BillingSettingsQueryKey,
  getAdminMt5SubscriptionsQueryKey,
  getAdminMt5BillingAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Cpu, DollarSign, TrendingUp, Users, Settings, Gift, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Active</Badge>;
  if (status === "EXPIRED") return <Badge variant="destructive">Expired</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export default function AdminMt5BillingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useGetAdminMt5BillingSettings();
  const { data: subscriptions = [], isLoading: subsLoading } = useGetAdminMt5Subscriptions();
  const { data: analytics, isLoading: analyticsLoading } = useGetAdminMt5BillingAnalytics();

  const { mutateAsync: updateSettings, isPending: updatingSettings } = useUpdateMt5BillingSettings();
  const { mutateAsync: grantSub, isPending: granting } = useAdminGrantMt5Subscription();

  const [feeInput, setFeeInput] = useState<string>("");
  const [minDaysInput, setMinDaysInput] = useState<string>("");
  const [maxAccountsInput, setMaxAccountsInput] = useState<string>("");

  const [grantAccountId, setGrantAccountId] = useState<string>("");
  const [grantDays, setGrantDays] = useState<string>("30");

  const handleSaveSettings = async () => {
    try {
      const payload: { feePerAccountPerDay?: number; minimumSubscriptionDays?: number; maximumMt5Accounts?: number } = {};
      if (feeInput) payload.feePerAccountPerDay = parseFloat(feeInput);
      if (minDaysInput) payload.minimumSubscriptionDays = parseInt(minDaysInput, 10);
      if (maxAccountsInput) payload.maximumMt5Accounts = parseInt(maxAccountsInput, 10);
      await updateSettings(payload);
      queryClient.invalidateQueries({ queryKey: getAdminMt5BillingSettingsQueryKey() });
      toast({ title: "Settings updated successfully" });
      setFeeInput(""); setMinDaysInput(""); setMaxAccountsInput("");
    } catch (err) {
      toast({ title: "Failed to update settings", variant: "destructive" });
    }
  };

  const handleGrant = async () => {
    const accountId = parseInt(grantAccountId, 10);
    const days = parseInt(grantDays, 10);
    if (!accountId || !days) { toast({ title: "Enter valid Account ID and days", variant: "destructive" }); return; }
    try {
      await grantSub({ slaveAccountId: accountId, numberOfDays: days });
      queryClient.invalidateQueries({ queryKey: getAdminMt5SubscriptionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getAdminMt5BillingAnalyticsQueryKey() });
      toast({ title: "Subscription granted successfully" });
      setGrantAccountId("");
    } catch (err) {
      toast({ title: "Failed to grant subscription", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-500/10">
          <Cpu className="w-6 h-6 text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MT5 Account Billing</h1>
          <p className="text-muted-foreground text-sm">Manage slot billing settings and subscriptions</p>
        </div>
      </div>

      {/* Analytics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Active Accounts",
            value: analyticsLoading ? "—" : analytics?.activeAccounts ?? 0,
            icon: CheckCircle,
            color: "text-green-400",
          },
          {
            label: "Expired Accounts",
            value: analyticsLoading ? "—" : analytics?.expiredAccounts ?? 0,
            icon: AlertTriangle,
            color: "text-red-400",
          },
          {
            label: "Total Revenue",
            value: analyticsLoading ? "—" : `KES ${(analytics?.totalRevenue ?? 0).toLocaleString()}`,
            icon: DollarSign,
            color: "text-green-400",
          },
          {
            label: "Total Subscriptions",
            value: subsLoading ? "—" : subscriptions.length,
            icon: Users,
            color: "text-blue-400",
          },
        ].map((stat) => (
          <Card key={stat.label} className="border-border bg-card">
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs uppercase tracking-wider font-medium">{stat.label}</span>
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{String(stat.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="w-4 h-4 text-green-500" />
              Billing Settings
            </CardTitle>
            <CardDescription>
              {settingsLoading ? "Loading..." : (
                <>
                  Current: KES {parseFloat(settings?.feePerAccountPerDay ?? "50")}/acct/day ·
                  Min {settings?.minimumSubscriptionDays ?? 7} days ·
                  Max {settings?.maximumMt5Accounts ?? 5} accounts
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Fee Per Account Per Day (KES)</Label>
              <Input
                type="number"
                placeholder={`Current: ${parseFloat(settings?.feePerAccountPerDay ?? "50")}`}
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                min={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum Subscription Days</Label>
              <Input
                type="number"
                placeholder={`Current: ${settings?.minimumSubscriptionDays ?? 7}`}
                value={minDaysInput}
                onChange={(e) => setMinDaysInput(e.target.value)}
                min={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Maximum MT5 Accounts Per User</Label>
              <Input
                type="number"
                placeholder={`Current: ${settings?.maximumMt5Accounts ?? 5}`}
                value={maxAccountsInput}
                onChange={(e) => setMaxAccountsInput(e.target.value)}
                min={1}
              />
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleSaveSettings}
              disabled={updatingSettings || (!feeInput && !minDaysInput && !maxAccountsInput)}
            >
              {updatingSettings ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Settings"}
            </Button>
          </CardContent>
        </Card>

        {/* Grant Subscription */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="w-4 h-4 text-green-500" />
              Grant Free Subscription
            </CardTitle>
            <CardDescription>Manually activate a subscription for any MT5 account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Slave Account ID</Label>
              <Input
                type="number"
                placeholder="Enter account ID from the MT5 accounts list"
                value={grantAccountId}
                onChange={(e) => setGrantAccountId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Find the account ID in the MT5 Accounts admin page</p>
            </div>
            <div className="space-y-1.5">
              <Label>Number of Days</Label>
              <div className="flex gap-2">
                {[7, 14, 30].map((d) => (
                  <Button
                    key={d}
                    variant={grantDays === String(d) ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGrantDays(String(d))}
                    className={grantDays === String(d) ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    {d}d
                  </Button>
                ))}
                <Input
                  type="number"
                  min={1}
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                  className="w-20 h-8 text-sm"
                />
              </div>
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleGrant}
              disabled={granting || !grantAccountId}
            >
              {granting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Granting...</> : <><Gift className="w-4 h-4 mr-2" />Grant Subscription</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Period */}
      {analytics?.revenueByPeriod && analytics.revenueByPeriod.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Revenue by Subscription Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {analytics.revenueByPeriod.map((r) => (
                <div key={r.numberOfDays} className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                  <p className="text-xl font-bold text-green-400">{r.numberOfDays}d</p>
                  <p className="text-sm text-muted-foreground">{r.count} active</p>
                  <p className="text-sm font-medium">KES {r.revenue.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">All MT5 Subscriptions</CardTitle>
          <CardDescription>{subscriptions.length} total records</CardDescription>
        </CardHeader>
        <CardContent>
          {subsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading subscriptions...</span>
            </div>
          ) : subscriptions.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">No subscriptions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left pb-2 font-medium">User</th>
                    <th className="text-left pb-2 font-medium">Account</th>
                    <th className="text-left pb-2 font-medium">Period</th>
                    <th className="text-left pb-2 font-medium">Amount</th>
                    <th className="text-left pb-2 font-medium">Expires</th>
                    <th className="text-left pb-2 font-medium">Days Left</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-muted/20">
                      <td className="py-2.5">
                        <p className="font-medium truncate max-w-[140px]">{sub.userName}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{sub.userEmail}</p>
                      </td>
                      <td className="py-2.5">
                        <p className="font-medium">{sub.mt5Login}</p>
                        <p className="text-xs text-muted-foreground">{sub.brokerServer}</p>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{sub.numberOfDays}d</td>
                      <td className="py-2.5 text-muted-foreground">KES {sub.amount.toLocaleString()}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2.5">
                        {sub.status === "ACTIVE" && sub.daysRemaining <= 3 ? (
                          <span className="text-red-400 font-medium">{sub.daysRemaining}d</span>
                        ) : sub.status === "ACTIVE" ? (
                          <span className="text-green-400">{sub.daysRemaining}d</span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5"><StatusBadge status={sub.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
