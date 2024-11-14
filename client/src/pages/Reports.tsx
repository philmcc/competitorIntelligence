import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useUser } from "../hooks/use-user";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Report } from "db/schema";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import useSWR from "swr";

export default function Reports() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useUser();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const { data, error, mutate } = useSWR<{ status: string; data: Report[] }>("/api/reports");

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/generate", { 
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      if (!res.ok) {
        throw new Error("Failed to generate report");
      }
      
      const result = await res.json();
      if (result.status === "success") {
        toast({
          title: "Success",
          description: "Report generated successfully"
        });
        mutate(); // Refresh the reports list
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || !data) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="container py-6">
          <div className="text-center text-red-500">Error loading reports</div>
        </div>
      </Layout>
    );
  }

  const reports = data.data || [];

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Reports</h1>
          <Button onClick={generateReport} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate New Report"
            )}
          </Button>
        </div>

        <div className="grid gap-6">
          {reports.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">
                  No reports generated yet. Click the button above to generate a new report.
                </p>
              </CardContent>
            </Card>
          ) : (
            reports.map((report) => (
              <Card key={report.id}>
                <CardHeader>
                  <CardTitle>Report - {new Date(report.generatedAt).toLocaleDateString()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Modules: {report.modules?.join(", ") || "Website Changes"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Competitors: {report.competitorIds?.length || 0}
                      </p>
                    </div>
                    <Button variant="outline" asChild>
                      <a href={report.reportUrl} target="_blank" rel="noopener noreferrer">
                        Download Report
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
