import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Layout from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Target, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAdmin } from "@/hooks/use-admin";
import AdminModules from "../components/AdminModules";
import { StatsCard } from "../components/StatsCard";
import { Switch } from "@/components/ui/switch";
import TrustpilotAnalysis from "@/components/TrustpilotAnalysis";
import WebsiteResearch from "@/components/WebsiteResearch";
import { useCompetitors } from "@/hooks/use-competitors";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { users, statistics, isLoading, isError, updateUser } = useAdmin();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(true);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<number | null>(null);
  const { competitors, isLoading: competitorsLoading } = useCompetitors();
  const [selectedCompetitor, setSelectedCompetitor] = useState<any>(null);

  useEffect(() => {
    // Fetch website tracking status
    fetch("/api/admin/tracking/status", {
      credentials: "include"
    })
      .then(res => res.json())
      .then(result => {
        if (result.status === "success") {
          setIsTrackingEnabled(result.data.enabled);
        }
      })
      .catch(error => {
        console.error("Failed to fetch tracking status:", error);
      });
  }, []);

  useEffect(() => {
    if (selectedCompetitorId && competitors) {
      const competitor = competitors.find(c => c.id === selectedCompetitorId);
      setSelectedCompetitor(competitor || null);
    }
  }, [selectedCompetitorId, competitors]);

  const handleTrackingToggle = async (enabled: boolean) => {
    try {
      const response = await fetch("/api/admin/tracking/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled })
      });

      const result = await response.json();
      if (result.status === "success") {
        setIsTrackingEnabled(enabled);
        toast({
          title: "Success",
          description: `Website change tracking ${enabled ? "enabled" : "disabled"} successfully`
        });
      } else {
        throw new Error(result.message || "Failed to update tracking status");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update tracking status",
        variant: "destructive"
      });
    }
  };

  const handleCompetitorSelect = (competitorId: number) => {
    setSelectedCompetitorId(competitorId);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-6">
          <Card>
            <CardContent className="py-6">
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <div className="container py-6">
          <Card>
            <CardContent className="py-6">
              <p className="text-center text-destructive">
                Error loading admin data
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const statsData = statistics?.data || {
    users: {
      totalUsers: 0,
      freeUsers: 0,
      proUsers: 0
    },
    competitors: {
      totalCompetitors: 0,
      activeCompetitors: 0,
      selectedCompetitors: 0
    }
  };

  const filteredUsers = users?.data ? users.data.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="modules">Research Modules</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <StatsCard
                title="Total Users"
                value={statsData.users.totalUsers}
                icon={<Users className="h-4 w-4" />}
              />
              <StatsCard
                title="Pro Users"
                value={statsData.users.proUsers}
                icon={<Users className="h-4 w-4" />}
              />
              <StatsCard
                title="Free Users"
                value={statsData.users.freeUsers}
                icon={<Users className="h-4 w-4" />}
              />
              <StatsCard
                title="Total Competitors"
                value={statsData.competitors.totalCompetitors}
                icon={<Target className="h-4 w-4" />}
              />
              <StatsCard
                title="Active Competitors"
                value={statsData.competitors.activeCompetitors}
                icon={<Target className="h-4 w-4" />}
              />
              <StatsCard
                title="Selected Competitors"
                value={statsData.competitors.selectedCompetitors}
                icon={<Target className="h-4 w-4" />}
              />
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage user accounts, plans, and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.plan}</TableCell>
                          <TableCell>
                            <Switch
                              checked={user.isAdmin}
                              onCheckedChange={async (checked) => {
                                await updateUser(user.id, { isAdmin: checked });
                              }}
                            />
                          </TableCell>
                          <TableCell>{user.websiteUrl}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLocation(`/admin/users/${user.id}/competitors`)}
                            >
                              View Competitors
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modules">
            {competitorsLoading ? (
              <div>Loading...</div>
            ) : selectedCompetitor ? (
              <div className="grid gap-6">
                <WebsiteResearch competitorId={selectedCompetitor.id} />
                <TrustpilotAnalysis competitorId={selectedCompetitor.id} />
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    Select a competitor to view research modules
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>
                  Configure global system settings and features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className="font-medium">Website Change Tracking</h4>
                      <p className="text-sm text-muted-foreground">
                        Enable or disable automated website change tracking for all competitors
                      </p>
                    </div>
                    <Switch
                      checked={isTrackingEnabled}
                      onCheckedChange={handleTrackingToggle}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
