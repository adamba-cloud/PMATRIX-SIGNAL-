import { useState } from "react";
import { useLocation, Link } from "wouter";
import { customFetch, ApiError, getGetMeQueryKey } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActivitySquare, Loader2, Gift } from "lucide-react";

export default function Register() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("ref") || "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState("");

  const registerMutation = useMutation({
    mutationFn: (data: { name: string; email: string; password: string; referralCode?: string }) =>
      customFetch<{ token: string; user: { id: number; email: string; name: string; role: string; mustChangePassword: boolean } }>(
        "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      ),
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (data.user.role === "ADMIN") {
        setLocation("/admin/dashboard");
      } else {
        setLocation("/dashboard");
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError((err.data as any)?.error || err.message);
      } else {
        setError("Registration failed. Please try again.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    registerMutation.mutate({
      name,
      email,
      password,
      ...(referralCode ? { referralCode } : {}),
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl shadow-black/50">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2 text-green-500">
            <ActivitySquare className="w-8 h-8" />
            <span className="font-bold text-2xl tracking-tight text-white">PESAMATRIX</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2 text-center">Create Account</h2>
        <p className="text-slate-400 text-center text-sm mb-8">Join the elite trading network</p>

        {referralCode && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-md text-sm mb-6">
            <Gift className="w-4 h-4 flex-shrink-0" />
            <span>Referral code applied — you'll get <strong>3 free days</strong> on signup!</span>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-md text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-slate-300">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20"
              placeholder="John Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20"
              placeholder="trader@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referral" className="text-slate-300">
              Referral Code <span className="text-slate-500 font-normal">(optional)</span>
            </Label>
            <Input
              id="referral"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20 font-mono tracking-widest"
              placeholder="e.g. PESA4B2K"
              maxLength={8}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-500 text-white border-0 h-12 text-md"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Account"}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-green-500 hover:text-green-400 font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
