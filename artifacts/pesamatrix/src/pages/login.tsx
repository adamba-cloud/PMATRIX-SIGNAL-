import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useLogin, getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActivitySquare, Loader2, RefreshCw } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  const loginMutation = useLogin();

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      await customFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      setResent(true);
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUnverifiedEmail(null);
    setResent(false);

    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          localStorage.setItem("token", data.token);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });

          if (data.user.mustChangePassword) {
            setLocation("/change-password");
          } else if (data.user.role === "ADMIN") {
            setLocation("/admin/dashboard");
          } else {
            setLocation("/dashboard");
          }
        },
        onError: (err: any) => {
          const apiError = err?.data?.error ?? err?.message ?? "Invalid credentials";
          if (apiError === "EMAIL_NOT_VERIFIED") {
            setUnverifiedEmail(err?.data?.email ?? email);
          } else {
            setError(apiError);
          }
        },
      }
    );
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

        <h2 className="text-2xl font-bold text-white mb-2 text-center">Secure Login</h2>
        <p className="text-slate-400 text-center text-sm mb-8">Enter your credentials to access your terminal</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-md text-sm mb-6 text-center">
            {error}
          </div>
        )}

        {unverifiedEmail && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 p-4 rounded-md text-sm mb-6">
            <p className="font-medium mb-1">Email not verified</p>
            <p className="text-yellow-400/80 mb-3">
              Please verify your email address before logging in. Check your inbox at{" "}
              <span className="font-medium text-yellow-300">{unverifiedEmail}</span>.
            </p>
            {resent ? (
              <p className="text-green-400 text-xs">✓ New verification email sent.</p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="flex items-center gap-1.5 text-xs text-yellow-300 hover:text-white underline underline-offset-2 disabled:opacity-50"
              >
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Resend verification email
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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

          <Button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-500 text-white border-0 h-12 text-md"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Access Terminal"}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-400">
          No account yet?{" "}
          <Link href="/register" className="text-green-500 hover:text-green-400 font-medium">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
