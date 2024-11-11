import { useUser } from "../hooks/use-user";
import { useCompetitors } from "../hooks/use-competitors";
import Layout from "../components/Layout";
import CompetitorCard from "../components/CompetitorCard";
import AddCompetitorDialog from "../components/AddCompetitorDialog";
import DiscoverCompetitorsDialog from "../components/DiscoverCompetitorsDialog";
import ResearchModules from "../components/ResearchModules";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mutate } from "swr";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: userLoading } = useUser();
  const { competitors, meta, isLoading: competitorsLoading } = useCompetitors();
  const { toast } = useToast();
  const [websiteUrl, setWebsiteUrl] = useState(user?.websiteUrl || "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/auth");
    }
  }, [user, userLoading, setLocation]);

  const handleSaveWebsite = async () => {
    try {
      const response = await fetch("/api/user/website", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl })
      });

      if (!response.ok) {
        throw new Error("Failed to update website URL");
      }

      setIsEditing(false);
      mutate("/api/user"); // Refresh user data
      toast({
        title: "Website URL updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error updating website URL",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  if (userLoading || competitorsLoading) {
    return <div>Loading...</div>;
  }

  const showUpgradeAlert = meta && meta.remaining === 0 && user?.plan === "free";
  const selectedCompetitors = competitors.filter(c => c.isSelected);
  const availableCompetitors = competitors.filter(c => !c.isSelected);

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            {meta && (
              <p className="text-sm text-muted-foreground mt-1">
                Selected {selectedCompetitors.length} of {meta.limit} competitor slots
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <DiscoverCompetitorsDialog />
            <AddCompetitorDialog />
          </div>
        </div>

        {showUpgradeAlert && (
          <Alert variant="default" className="bg-yellow-50 border-yellow-200">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-600">
              You've reached the maximum number of selected competitors for the free plan.{" "}
              <Button
                variant="link"
                className="p-0 text-yellow-600 underline hover:text-yellow-700"
                onClick={() => setLocation("/settings")}
              >
                Upgrade to Pro
              </Button>{" "}
              to select more competitors.
            </AlertDescription>
          </Alert>
        )}

        <section className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Website</CardTitle>
              <CardDescription>
                This URL is used to discover relevant competitors for your business
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Input 
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.example.com"
                  type="url"
                  disabled={!isEditing}
                />
                {isEditing ? (
                  <div className="flex gap-2">
                    <Button onClick={handleSaveWebsite}>Save</Button>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>Edit</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Selected Competitors</h2>
          {selectedCompetitors.length === 0 ? (
            <div className="text-center p-8 border rounded-lg bg-muted/10">
              <p className="text-muted-foreground">
                No competitors selected. Use the switch toggle to select competitors you want to track.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {selectedCompetitors.map((competitor) => (
                <CompetitorCard key={competitor.id} competitor={competitor} />
              ))}
            </div>
          )}
          
          <h2 className="text-2xl font-semibold mb-4 mt-8">Available Competitors</h2>
          {availableCompetitors.length === 0 ? (
            <div className="text-center p-8 border rounded-lg bg-muted/10">
              <p className="text-muted-foreground">
                No available competitors. Use the buttons above to add competitors.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {availableCompetitors.map((competitor) => (
                <CompetitorCard key={competitor.id} competitor={competitor} />
              ))}
            </div>
          )}
        </section>

        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Research Modules</h2>
          <ResearchModules />
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={() => setLocation("/reports")} variant="outline">
            View Reports
          </Button>
        </div>
      </div>
    </Layout>
  );
}
