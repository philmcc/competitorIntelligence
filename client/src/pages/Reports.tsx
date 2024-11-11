import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useUser } from "../hooks/use-user";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Report } from "db/schema";
import useSWR from "swr";

export default function Reports() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useUser();
  const { data, error } = useSWR<{ status: string; data: Report[] }>("/api/reports");

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  const generateReport = async () => {
    const res = await fetch("/api/reports/generate", { method: "POST" });
    if (res.ok) {
      const newReport = await res.json();
      // Refresh the reports list
      window.location.reload();
    }
  };

  if (isLoading || !data) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error loading reports</div>;
  }

  const reports = data.data || [];

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Reports</h1>
          <Button onClick={generateReport}>Generate New Report</Button>
        </div>

        <div className="grid gap-6">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <CardTitle>Report - {new Date(report.generatedAt).toLocaleDateString()}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Modules: {report.modules.join(", ")}
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
          ))}
        </div>
      </div>
    </Layout>
  );
}
