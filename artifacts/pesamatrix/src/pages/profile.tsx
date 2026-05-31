import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User as UserIcon, Mail, Shield, Calendar, Phone, Save } from "lucide-react";
import { format } from "date-fns";

export default function Profile() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [editing, setEditing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (whatsappNumber: string) =>
      customFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: whatsappNumber || null }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setEditing(false);
      toast({ title: "WhatsApp number saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const currentWhatsapp = (user as any).whatsappNumber ?? "";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">View your account details and preferences.</p>
      </div>

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
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save</>}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="border-border">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
