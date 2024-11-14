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

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { users, statistics, isLoading, isError, updateUser } = useAdmin();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("overview");

  const filteredUsers = users?.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleViewCompetitors = (userId: number) => {
    setLocation(`/admin/users/${userId}/competitors`);
  };

  const handleUpdateUser = async (userId: number, updates: any) => {
    const result = await updateUser(userId, updates);
    if (result.ok) {
      toast({
        title: "Success",
        description: "User updated successfully"
      });
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive"
      });
    }
  };

  if (isError) {
    return (
      <Layout>
        <div className="container py-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load admin dashboard data. Please try again later.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {statistics && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      User Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt>Total Users</dt>
                        <dd>{statistics.users.totalUsers}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Free Plan Users</dt>
                        <dd>{statistics.users.freeUsers}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Pro Plan Users</dt>
                        <dd>{statistics.users.proUsers}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Competitor Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt>Total Competitors</dt>
                        <dd>{statistics.competitors.totalCompetitors}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Active Competitors</dt>
                        <dd>{statistics.competitors.activeCompetitors}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Selected Competitors</dt>
                        <dd>{statistics.competitors.selectedCompetitors}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </div>
            )}
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
                          <TableCell>
                            <select
                              value={user.plan}
                              onChange={(e) => handleUpdateUser(user.id, { plan: e.target.value })}
                              className="border rounded p-1"
                            >
                              <option value="free">Free</option>
                              <option value="pro">Pro</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={user.isAdmin}
                              onChange={(e) => handleUpdateUser(user.id, { isAdmin: e.target.checked })}
                              className="rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell>{user.websiteUrl || "Not set"}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewCompetitors(user.id)}
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
        </Tabs>
      </div>
    </Layout>
  );
}
