import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User as UserIcon, Mail, Shield, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function Profile() {
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">Profile</h2>
        <p className="text-slate-400">View your account details and preferences.</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="border-b border-slate-800 pb-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 border border-green-500/30">
              <UserIcon className="w-8 h-8" />
            </div>
            <div>
              <CardTitle className="text-2xl text-slate-50">{user.name}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="border-green-500 text-green-500 bg-green-500/10">
                  {user.role}
                </Badge>
                <span className="text-sm text-slate-400">ID: #{user.id}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800">
              <Mail className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email Address</p>
                <p className="text-sm font-medium text-slate-200 mt-1">{user.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800">
              <Shield className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Security</p>
                <p className="text-sm font-medium text-slate-200 mt-1">
                  {user.mustChangePassword ? "Password Change Required" : "Password Secured"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800 md:col-span-2">
              <Calendar className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Member Since</p>
                <p className="text-sm font-medium text-slate-200 mt-1">
                  {format(new Date(user.createdAt), 'MMMM dd, yyyy')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}