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
import { ResearchHistory } from "@/components/ResearchHistory";

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
  const [runningWebsiteResearch, setRunningWebsiteResearch] = useState(false);
  const [runningTrustpilotResearch, setRunningTrustpilotResearch] = useState(false);
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

  const runWebsiteResearch = async () => {
    if (!competitor) return;
    
    setRunningWebsiteResearch(true);
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
      setRunningWebsiteResearch(false);
    }
  };

  const runTrustpilotResearch = async () => {
    if (!competitor) return;
    
    setRunningTrustpilotResearch(true);
    try {
      const response = await fetch(`/api/competitors/${competitor.id}/trustpilot`, {
        method: "POST",
      });

      const data = await response.json();
      
      if (data.status === "success") {
        toast({
          title: "Trustpilot Analysis Complete",
          description: "Trustpilot review analysis has been completed successfully.",
        });
        
        // Refresh research history
        const historyResponse = await fetch(`/api/competitors/${competitor.id}/research-history`);
        const historyData = await historyResponse.json();
        if (historyData.status === "success") {
          setResearchRuns(historyData.data);
        }
      }
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze Trustpilot reviews",
        variant: "destructive",
      });
    } finally {
      setRunningTrustpilotResearch(false);
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
              <div className="flex space-x-4">
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
                <Button 
                  onClick={runWebsiteResearch} 
                  disabled={runningWebsiteResearch}
                >
                  {runningWebsiteResearch ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    "Run Website Research"
                  )}
                </Button>
                <Button 
                  onClick={runTrustpilotResearch} 
                  disabled={runningTrustpilotResearch}
                >
                  {runningTrustpilotResearch ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze Trustpilot Reviews"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research History</CardTitle>
          </CardHeader>
          <CardContent>
            <ResearchHistory runs={researchRuns} />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
} 