import { useUser } from "../hooks/use-user";
import { useCompetitors } from "../hooks/use-competitors";
import Layout from "../components/Layout";
import CompetitorCard from "../components/CompetitorCard";
import AddCompetitorDialog from "../components/AddCompetitorDialog";
import DiscoverCompetitorsDialog from "../components/DiscoverCompetitorsDialog";
import ResearchModules from "../components/ResearchModules";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: userLoading } = useUser();
  const { competitors, isLoading: competitorsLoading } = useCompetitors();

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/auth");
    }
  }, [user, userLoading, setLocation]);

  if (userLoading || competitorsLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex gap-2">
            <DiscoverCompetitorsDialog />
            <AddCompetitorDialog />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {competitors?.map((competitor) => (
            <CompetitorCard key={competitor.id} competitor={competitor} />
          ))}
        </div>

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
