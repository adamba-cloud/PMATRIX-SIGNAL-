import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Ticker } from "./ticker";
import { AnnouncementBanner } from "./announcement-banner";
import { useTheme } from "@/contexts/theme";
import { AdCarousel } from "./ad-carousel";
import {
  LayoutDashboard,
  ActivitySquare,
  CreditCard,
  User as UserIcon,
  LogOut,
  Settings,
  Users,
  ShieldCheck,
  Cpu,
  GitFork,
  ImageIcon,
  Newspaper,
  BookOpen,
  FolderOpen,
  Megaphone,
  Sun,
  Moon,
  Radio,
  Bell,
  BellOff,
  BellRing,
  Gift,
  Calculator,
  Megaphone as MegaphoneIcon,
  Layers,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { AdminNotificationBell } from "./admin-notification-bell";
import { Button } from "./ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });
  const { theme, toggleTheme } = useTheme();
  const { state: pushState, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();

  const isAuthPage =
    location === "/login" ||
    location === "/register" ||
    location.startsWith("/verify-email") ||
    location.startsWith("/forgot-password") ||
    location.startsWith("/reset-password");
  const isLandingPage = location === "/";
  const isChangePassword = location === "/change-password";

  // Must be declared before any conditional returns to follow Rules of Hooks
  const { data: logoData } = useQuery<{ url: string | null }>({
    queryKey: ["logo"],
    queryFn: () => customFetch<{ url: string | null }>("/api/logo"),
    staleTime: 5 * 60 * 1000,
    enabled: !!user && !isAuthPage && !isLandingPage && !isChangePassword,
  });

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
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Ticker />
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden">
      <Ticker />
      <AdCarousel />
      <AnnouncementBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-card border-r border-border flex flex-col flex-shrink-0">
          <div className="p-6">
            {logoData?.url ? (
              <img
                src={logoData.url}
                alt="PESAMATRIX"
                className="h-10 w-auto max-w-full object-contain"
              />
            ) : (
              <h1 className="text-xl font-bold tracking-tight text-green-500 flex items-center gap-2">
                <ActivitySquare className="w-6 h-6" />
                PESAMATRIX
              </h1>
            )}
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
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
                <SidebarLink href="/mt5" icon={Cpu}>MT5 Accounts</SidebarLink>
                <SidebarLink href="/mt5-subscription" icon={ShieldCheck}>MT5 Subscription</SidebarLink>
                <SidebarLink href="/copy-trading" icon={GitFork}>Copy Trading</SidebarLink>
                <SidebarLink href="/trading-calculator" icon={Calculator}>Growth Calculator</SidebarLink>
                <SidebarLink href="/trade-journal" icon={BookOpen}>Trade Journal</SidebarLink>
                <SidebarLink href="/advertisements" icon={MegaphoneIcon}>Advertise</SidebarLink>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-4">
                  Content
                </div>
                <SidebarLink href="/gallery" icon={ImageIcon}>Gallery</SidebarLink>
                <SidebarLink href="/news" icon={Newspaper}>News</SidebarLink>
                <SidebarLink href="/resources" icon={BookOpen}>Resources</SidebarLink>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-4">
                  Account
                </div>
                <SidebarLink href="/profile" icon={UserIcon}>Profile</SidebarLink>
              </>
            ) : (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-2">
                  Admin Panel
                </div>
                <SidebarLink href="/admin/dashboard" icon={LayoutDashboard}>Overview</SidebarLink>
                <SidebarLink href="/admin/users" icon={Users}>Users</SidebarLink>
                <SidebarLink href="/admin/subscriptions" icon={ShieldCheck}>Subscriptions</SidebarLink>
                <SidebarLink href="/admin/payments" icon={CreditCard}>Payments</SidebarLink>
                <SidebarLink href="/admin/config" icon={Settings}>System Config</SidebarLink>
                <SidebarLink href="/admin/mt5" icon={Cpu}>MT5 Accounts</SidebarLink>
                <SidebarLink href="/admin/mt5-billing" icon={CreditCard}>MT5 Billing</SidebarLink>
                <SidebarLink href="/admin/master" icon={Cpu}>Master Account</SidebarLink>
                <SidebarLink href="/admin/master-events" icon={ActivitySquare}>Master Events</SidebarLink>
                <SidebarLink href="/admin/queue-monitor" icon={Layers}>Queue Monitor</SidebarLink>
                <SidebarLink href="/admin/content" icon={FolderOpen}>Content</SidebarLink>
                <SidebarLink href="/admin/signals" icon={Radio}>Signals</SidebarLink>
                <SidebarLink href="/admin/announcements" icon={Megaphone}>Announcements</SidebarLink>
                <SidebarLink href="/admin/referrals" icon={Gift}>Referrals</SidebarLink>
                <SidebarLink href="/admin/advertisements" icon={MegaphoneIcon}>Advertisements</SidebarLink>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-4">
                  User View
                </div>
                <SidebarLink href="/signals" icon={ActivitySquare}>All Signals</SidebarLink>
              </>
            )}
          </nav>

          <div className="p-4 border-t border-border space-y-3">
            <div className="flex items-center justify-between px-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {isAdmin && <AdminNotificationBell />}
                {pushState !== "unsupported" && (
                  <button
                    onClick={pushState === "subscribed" ? unsubscribePush : subscribePush}
                    disabled={pushState === "loading"}
                    className={`p-1.5 rounded-md transition-colors ${
                      pushState === "subscribed"
                        ? "text-green-500 hover:text-green-400 hover:bg-green-500/10"
                        : pushState === "denied"
                        ? "text-red-400 cursor-not-allowed opacity-50"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                    title={
                      pushState === "subscribed"
                        ? "Notifications on — click to disable"
                        : pushState === "denied"
                        ? "Notifications blocked in browser settings"
                        : "Enable signal notifications"
                    }
                  >
                    {pushState === "subscribed" ? (
                      <BellRing className="w-4 h-4" />
                    ) : pushState === "denied" ? (
                      <BellOff className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-accent border-border"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-background p-8">
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
          ? "bg-green-500/10 text-green-500"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </Link>
  );
}
