import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Ticker } from "./ticker";
import {
  LayoutDashboard,
  ActivitySquare,
  CreditCard,
  User as UserIcon,
  LogOut,
  Settings,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const isAuthPage = location === "/login" || location === "/register";
  const isLandingPage = location === "/";
  const isChangePassword = location === "/change-password";

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isAuthPage && !isLandingPage && !isChangePassword) {
      setLocation("/login");
      return;
    }
    if (user && user.mustChangePassword && !isChangePassword) {
      setLocation("/change-password");
      return;
    }
    if (user && !user.mustChangePassword && isAuthPage) {
      setLocation(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
    }
  }, [isLoading, user, isAuthPage, isLandingPage, isChangePassword, setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  if (isLandingPage || isAuthPage || isChangePassword) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
        <Ticker />
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
      <Ticker />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0">
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight text-green-500 flex items-center gap-2">
              <ActivitySquare className="w-6 h-6" />
              PESAMATRIX
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
              Signals Platform
            </p>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {!isAdmin ? (
              <>
                <SidebarLink href="/dashboard" icon={LayoutDashboard}>Dashboard</SidebarLink>
                <SidebarLink href="/signals" icon={ActivitySquare}>Signals</SidebarLink>
                <SidebarLink href="/subscription" icon={ShieldCheck}>Subscription</SidebarLink>
                <SidebarLink href="/payments" icon={CreditCard}>Payments</SidebarLink>
                <SidebarLink href="/profile" icon={UserIcon}>Profile</SidebarLink>
              </>
            ) : (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 mt-2">
                  Admin Panel
                </div>
                <SidebarLink href="/admin/dashboard" icon={LayoutDashboard}>Overview</SidebarLink>
                <SidebarLink href="/admin/users" icon={Users}>Users</SidebarLink>
                <SidebarLink href="/admin/subscriptions" icon={ShieldCheck}>Subscriptions</SidebarLink>
                <SidebarLink href="/admin/payments" icon={CreditCard}>Payments</SidebarLink>
                <SidebarLink href="/admin/config" icon={Settings}>System Config</SidebarLink>
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 mt-4">
                  User View
                </div>
                <SidebarLink href="/signals" icon={ActivitySquare}>All Signals</SidebarLink>
              </>
            )}
          </nav>

          <div className="p-4 border-t border-slate-800">
            <div className="mb-4 px-2">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-slate-800 border-slate-700"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const isActive = location === href || location.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-green-500/10 text-green-400"
          : "text-slate-400 hover:text-slate-50 hover:bg-slate-800"
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </Link>
  );
}
