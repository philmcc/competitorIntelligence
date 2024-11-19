import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";

interface ResearchRun {
  id: number;
  runDate: string;
  changesMade: boolean;
  changeDetails: string;
  currentText: string;
}

interface Competitor {
  id: number;
  name: string;
  website: string;
  isActive: boolean;
  createdAt: string;
}

export default function CompetitorResearch() {
  const [, params] = useRoute("/admin/competitors/:competitorId/research");
  const [competitor, setCompetitor] = useState<Competitor | null>(null);
  const [researchRuns, setResearchRuns] = useState<ResearchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningResearch, setRunningResearch] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch competitor details
        const competitorResponse = await fetch(`/api/admin/competitors/${params?.competitorId}`);
        const competitorData = await competitorResponse.json();
        
        if (competitorData.status === "success") {
          setCompetitor(competitorData.data);
        }

        // Fetch research history
        const historyResponse = await fetch(`/api/admin/competitors/${params?.competitorId}/research-history`);
        const historyData = await historyResponse.json();
        
        if (historyData.status === "success") {
          setResearchRuns(historyData.data);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: "Failed to load research data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    if (params?.competitorId) {
      fetchData();
    }
  }, [params?.competitorId]);

  const runResearch = async () => {
    if (!competitor) return;
    
    setRunningResearch(true);
    try {
      const response = await fetch(`/api/admin/competitors/${competitor.id}/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ website: competitor.website }),
      });

      const data = await response.json();
      
      if (data.status === "success") {
        toast({
          title: "Research Complete",
          description: data.data.changesMade ? 
            `Changes detected: ${data.data.changeDetails}` : 
            "No changes detected",
        });
        
        // Refresh research history
        const historyResponse = await fetch(`/api/admin/competitors/${competitor.id}/research-history`);
        const historyData = await historyResponse.json();
        if (historyData.status === "success") {
          setResearchRuns(historyData.data);
        }
      }
    } catch (error) {
      toast({
        title: "Research Failed",
        description: "Failed to run research",
        variant: "destructive",
      });
    } finally {
      setRunningResearch(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!competitor) {
    return (
      <Layout>
        <div className="container py-6">
          <div className="text-center">Competitor not found</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{competitor.name}</CardTitle>
            <CardDescription>
              <a 
                href={competitor.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {competitor.website}
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  Status: {competitor.isActive ? "Active" : "Inactive"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Added: {new Date(competitor.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button 
                onClick={runResearch}
                disabled={runningResearch}
              >
                {runningResearch ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running Research...
                  </>
                ) : (
                  "Run Research"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research History</CardTitle>
            <CardDescription>
              Previous research runs and their results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {researchRuns.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No research runs found
              </p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {researchRuns.map((run) => (
                  <AccordionItem key={run.id} value={run.id.toString()}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-4">
                        <span>{new Date(run.runDate).toLocaleString()}</span>
                        <span className={`text-sm ${run.changesMade ? 'text-green-500' : 'text-yellow-500'}`}>
                          {run.changesMade ? 'Changes Detected' : 'No Changes'}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 p-4">
                        {run.changesMade && (
                          <div>
                            <h4 className="font-medium mb-2">Changes Detected:</h4>
                            <p className="whitespace-pre-wrap text-sm">
                              {run.changeDetails}
                            </p>
                          </div>
                        )}
                        <div>
                          <h4 className="font-medium mb-2">Website Content:</h4>
                          <pre className="text-xs bg-muted p-4 rounded-md overflow-auto">
                            {run.currentText}
                          </pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
} 