import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { customFetch, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ActivitySquare, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "success" | "error";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in this link.");
      return;
    }

    customFetch<{ token: string; user: { id: number; email: string; name: string; role: string; mustChangePassword?: boolean }; alreadyVerified?: boolean }>(
      `/api/auth/verify-email?token=${encodeURIComponent(token)}`
    )
      .then((data) => {
        localStorage.setItem("token", data.token);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setStatus("success");

        setTimeout(() => {
          if (data.user.mustChangePassword) {
            setLocation("/change-password");
          } else if (data.user.role === "ADMIN") {
            setLocation("/admin/dashboard");
          } else {
            setLocation("/dashboard");
          }
        }, 2500);
      })
      .catch((err: any) => {
        setStatus("error");
        setMessage(err?.data?.error ?? err?.message ?? "Verification failed. The link may have expired.");
      });
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl shadow-black/50 text-center">
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2 text-green-500">
            <ActivitySquare className="w-7 h-7" />
            <span className="font-bold text-xl tracking-tight text-white">PESAMATRIX</span>
          </div>
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Verifying your email…</h2>
            <p className="text-slate-400 text-sm">Please wait a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Email verified!</h2>
            <p className="text-slate-400 text-sm mb-6">Your account is now active. Redirecting to your dashboard…</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Verification failed</h2>
            <p className="text-slate-400 text-sm mb-6">{message}</p>
            <div className="flex flex-col gap-3">
              <Link href="/login">
                <Button className="w-full bg-green-600 hover:bg-green-500 text-white border-0">
                  Back to Login
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:text-white">
                  Create a new account
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
