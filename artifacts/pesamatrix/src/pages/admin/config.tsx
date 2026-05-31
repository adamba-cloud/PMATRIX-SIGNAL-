import { useState, useEffect, useRef } from "react";
import { useGetConfig, getGetConfigQueryKey, useUpdateConfig } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Settings } from "lucide-react";
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    updateConfigMutation.mutate(
      { 
        data: { 
          feePerDay: Number(feePerDay), 
          minDays: Number(minDays) 
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
          toast({
            title: "Configuration Saved",
            description: "System configuration has been updated successfully.",
          });
        },
        onError: (err: any) => {
          toast({
            title: "Error",
            description: err.message || "Failed to update configuration.",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">System Configuration</h2>
        <p className="text-slate-400">Manage global pricing and subscription rules.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-50 flex items-center gap-2">
            <Settings className="w-5 h-5 text-green-500" />
            Pricing Rules
          </CardTitle>
          <CardDescription className="text-slate-400">
            These settings affect all new subscriptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="feePerDay" className="text-slate-300">Fee Per Day (KES)</Label>
              <Input 
                id="feePerDay" 
                type="number"
                min="0"
                value={feePerDay}
                onChange={(e) => setFeePerDay(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20"
                required
              />
              <p className="text-xs text-slate-500">The daily cost for access to trading signals.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minDays" className="text-slate-300">Minimum Days Required</Label>
              <Input 
                id="minDays" 
                type="number" 
                min="1"
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20"
                required
              />
              <p className="text-xs text-slate-500">The minimum duration a user must subscribe for.</p>
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
        </CardContent>
      </Card>
    </div>
  );
}