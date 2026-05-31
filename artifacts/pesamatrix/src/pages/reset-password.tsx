import { useState } from "react";
import { useLocation, Link } from "wouter";
import { customFetch, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActivitySquare, Loader2, CheckCircle, XCircle } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  if (!token) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl shadow-black/50 text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Invalid link</h2>
          <p className="text-slate-400 text-sm mb-6">This password reset link is missing a token.</p>
          <Link href="/forgot-password">
            <Button className="bg-green-600 hover:bg-green-500 text-white border-0">Request a new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (tokenInvalid) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl shadow-black/50 text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Link expired or invalid</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Link href="/forgot-password">
            <Button className="bg-green-600 hover:bg-green-500 text-white border-0">Request a new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl shadow-black/50 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Password updated!</h2>
          <p className="text-slate-400 text-sm mb-6">You're now logged in. Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await customFetch<{ token: string; user: { role: string; mustChangePassword?: boolean } }>(
        "/api/auth/reset-password",
        { method: "POST", body: JSON.stringify({ token, password }) }
      );
      localStorage.setItem("token", data.token);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setDone(true);
      setTimeout(() => {
        if (data.user.role === "ADMIN") {
          setLocation("/admin/dashboard");
        } else {
          setLocation("/dashboard");
        }
      }, 2000);
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? "Reset failed. The link may have expired.";
      setError(msg);
      if (err?.status === 400) setTokenInvalid(true);
    } finally {
      setLoading(false);
    }
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

        <h2 className="text-2xl font-bold text-white mb-2 text-center">Set New Password</h2>
        <p className="text-slate-400 text-center text-sm mb-8">Choose a strong password for your account.</p>

        {error && !tokenInvalid && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-md text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20"
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-slate-300">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white focus:border-green-500 focus:ring-green-500/20"
              placeholder="••••••••"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-500 text-white border-0 h-12 text-md"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Reset Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
