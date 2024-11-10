import { Button } from "@/components/ui/button";
import { useUser } from "../hooks/use-user";
import { useLocation } from "wouter";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { user, logout } = useUser();

  const handleLogout = async () => {
    await logout();
    setLocation("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="font-semibold">Competitor Intelligence</div>
          {user && (
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setLocation("/dashboard")}>
                Dashboard
              </Button>
              <Button variant="ghost" onClick={() => setLocation("/reports")}>
                Reports
              </Button>
              <Button variant="ghost" onClick={() => setLocation("/settings")}>
                Settings
              </Button>
              <span className="text-sm text-muted-foreground">
                {user.username} ({user.plan})
              </span>
              <Button variant="ghost" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
