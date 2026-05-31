import { useState } from "react";
import { useGetMySubscription, getGetMySubscriptionQueryKey, useGetConfig, getGetConfigQueryKey, useCreateSubscription } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export default function Subscription() {
  const queryClient = useQueryClient();
  const { data: subscription, isLoading: isLoadingSub } = useGetMySubscription({ query: { queryKey: getGetMySubscriptionQueryKey() } });
  const { data: config, isLoading: isLoadingConfig } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });
  const createSubscriptionMutation = useCreateSubscription();

  const [days, setDays] = useState<number>(30);

  if (isLoadingSub || isLoadingConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  const hasActiveSub = subscription && subscription.status === 'ACTIVE';
  const minDays = config?.minDays || 30;
  const feePerDay = config?.feePerDay || 100;
  const selectedDays = Math.max(days, minDays);
  const totalAmount = selectedDays * feePerDay;

  const handleSubscribe = () => {
    createSubscriptionMutation.mutate(
      { data: { daysSelected: selectedDays } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Subscription</h2>
        <p className="text-slate-400">Manage your trading terminal access.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-50 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-500" />
              Current Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status</span>
                  <Badge variant="outline" className={`
                    ${subscription.status === 'ACTIVE' ? 'border-green-500 text-green-500 bg-green-500/10' : ''}
                    ${subscription.status === 'PENDING' ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : ''}
                    ${subscription.status === 'EXPIRED' ? 'border-red-500 text-red-500 bg-red-500/10' : ''}
                  `}>
                    {subscription.status}
                  </Badge>
                </div>
                
                {subscription.startDate && subscription.endDate && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Start Date</span>
                      <span className="text-slate-200 font-medium">
                        {format(new Date(subscription.startDate), 'MMM dd, yyyy')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Valid Until</span>
                      <span className="text-slate-200 font-medium">
                        {format(new Date(subscription.endDate), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Plan Duration</span>
                  <span className="text-slate-200 font-medium">{subscription.daysSelected} Days</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400">
                You do not have an active subscription.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-green-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <ShieldCheck className="w-32 h-32 text-green-500" />
          </div>
          <CardHeader>
            <CardTitle className="text-slate-50">New Subscription</CardTitle>
            <CardDescription className="text-slate-400">Calculate and renew your access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 relative z-10">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-sm font-medium text-slate-300">Duration (Days)</label>
                <span className="text-2xl font-bold text-white">{selectedDays}</span>
              </div>
              <Slider
                value={[days]}
                min={minDays}
                max={365}
                step={1}
                onValueChange={(vals) => setDays(vals[0])}
                className="py-4"
              />
              <p className="text-xs text-slate-500">Minimum {minDays} days required</p>
            </div>

            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Daily Rate</span>
                <span className="text-slate-200">KES {feePerDay}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Duration</span>
                <span className="text-slate-200">{selectedDays} Days</span>
              </div>
              <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
                <span className="font-medium text-slate-300">Total Amount</span>
                <span className="text-xl font-bold text-green-500">KES {totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="relative z-10">
            <Button 
              className="w-full bg-green-600 hover:bg-green-500 text-white h-12"
              onClick={handleSubscribe}
              disabled={createSubscriptionMutation.isPending || (hasActiveSub && subscription?.status === 'ACTIVE')}
            >
              {createSubscriptionMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : hasActiveSub ? (
                "Subscription Active"
              ) : (
                <>Purchase Access</>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}