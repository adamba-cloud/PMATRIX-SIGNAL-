import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";

// Pages
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ChangePassword from "@/pages/change-password";
import Dashboard from "@/pages/dashboard";
import Signals from "@/pages/signals";
import Payments from "@/pages/payments";
import Subscription from "@/pages/subscription";
import Profile from "@/pages/profile";
import Mt5Accounts from "@/pages/mt5";

// Admin Pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminSubscriptions from "@/pages/admin/subscriptions";
import AdminPayments from "@/pages/admin/payments";
import AdminConfig from "@/pages/admin/config";
import AdminMt5 from "@/pages/admin/mt5";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/change-password" component={ChangePassword} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/signals" component={Signals} />
        <Route path="/payments" component={Payments} />
        <Route path="/subscription" component={Subscription} />
        <Route path="/profile" component={Profile} />
        <Route path="/mt5" component={Mt5Accounts} />
        
        {/* Admin Routes */}
        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/subscriptions" component={AdminSubscriptions} />
        <Route path="/admin/payments" component={AdminPayments} />
        <Route path="/admin/config" component={AdminConfig} />
        <Route path="/admin/mt5" component={AdminMt5} />
        
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;