import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/theme";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, background: "#0f172a", minHeight: "100vh", color: "#f1f5f9", fontFamily: "monospace" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <h1 style={{ color: "#ef4444", fontSize: 20, marginBottom: 8 }}>Application Error</h1>
            <p style={{ color: "#94a3b8", marginBottom: 16 }}>Something crashed on startup. Please report this error:</p>
            <pre style={{ background: "#1e293b", padding: 16, borderRadius: 8, overflowX: "auto", fontSize: 13, color: "#fca5a5" }}>
              {err.name}: {err.message}
              {"\n\n"}
              {err.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import VerifyEmail from "@/pages/verify-email";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import ChangePassword from "@/pages/change-password";
import Dashboard from "@/pages/dashboard";
import Signals from "@/pages/signals";
import Payments from "@/pages/payments";
import Subscription from "@/pages/subscription";
import Profile from "@/pages/profile";
import Mt5Accounts from "@/pages/mt5";
import CopyTrading from "@/pages/copy-trading";
import Gallery from "@/pages/gallery";
import News from "@/pages/news";
import Resources from "@/pages/resources";
import TradingCalculator from "@/pages/trading-calculator";
import TradeJournal from "@/pages/trade-journal";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminSubscriptions from "@/pages/admin/subscriptions";
import AdminPayments from "@/pages/admin/payments";
import AdminConfig from "@/pages/admin/config";
import AdminMt5 from "@/pages/admin/mt5";
import AdminContent from "@/pages/admin/content";
import AdminAnnouncements from "@/pages/admin/announcements";
import AdminSignals from "@/pages/admin/signals";
import AdminReferrals from "@/pages/admin/referrals";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/change-password" component={ChangePassword} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/signals" component={Signals} />
        <Route path="/payments" component={Payments} />
        <Route path="/subscription" component={Subscription} />
        <Route path="/profile" component={Profile} />
        <Route path="/mt5" component={Mt5Accounts} />
        <Route path="/copy-trading" component={CopyTrading} />
        <Route path="/gallery" component={Gallery} />
        <Route path="/news" component={News} />
        <Route path="/resources" component={Resources} />
        <Route path="/trading-calculator" component={TradingCalculator} />
        <Route path="/trade-journal" component={TradeJournal} />

        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/subscriptions" component={AdminSubscriptions} />
        <Route path="/admin/payments" component={AdminPayments} />
        <Route path="/admin/config" component={AdminConfig} />
        <Route path="/admin/mt5" component={AdminMt5} />
        <Route path="/admin/content" component={AdminContent} />
        <Route path="/admin/announcements" component={AdminAnnouncements} />
        <Route path="/admin/signals" component={AdminSignals} />
        <Route path="/admin/referrals" component={AdminReferrals} />

        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
