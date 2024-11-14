import { Switch, Route } from "wouter";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import UserCompetitors from "./pages/UserCompetitors";
import Auth from "./pages/Auth";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { Toaster } from "./components/ui/toaster";

export default function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/auth" component={Auth} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/users/:userId/competitors" component={UserCompetitors} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
      </Switch>
      <Toaster />
    </>
  );
}
