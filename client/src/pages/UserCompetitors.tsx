import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useUser } from "@/hooks/use-user";
import { useRoute } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Competitor {
  id: number;
  name: string;
  website: string;
  isSelected: boolean;
  createdAt: string;
  reason?: string;
}

interface ResearchResult {
  id: number;
  runDate: string;
  changesMade: boolean;
  changeDetails: string;
  currentText: string;
}

export default function UserCompetitors() {
  const { user, isLoading: userLoading } = useUser();
  const [, params] = useRoute("/admin/users/:userId/competitors");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [runningResearch, setRunningResearch] = useState<number | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<number | null>(null);
  const [researchHistory, setResearchHistory] = useState<ResearchResult[]>([]);

  useEffect(() => {
    async function fetchCompetitors() {
      if (!params?.userId) return;
      
      try {
        setIsLoading(true);
        const response = await fetch(`/api/admin/users/${params.userId}/competitors`);
        const data = await response.json();
        
        if (data.status === 'success') {
          setCompetitors(data.data);
        } else {
          setError(data.message || 'Failed to fetch competitors');
        }
      } catch (err) {
        setError('Failed to fetch competitors');
        console.error('Error fetching competitors:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCompetitors();
  }, [params?.userId]);

  const runWebsiteResearch = async (competitorId: number, website: string) => {
    try {
      setRunningResearch(competitorId);
      
      const response = await fetch(`/api/admin/competitors/${competitorId}/research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ website }),
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        toast({
          title: "Research Complete",
          description: data.data.changesMade ? 
            `Changes detected: ${data.data.changeDetails}` : 
            "No changes detected",
        });
      } else {
        throw new Error(data.message || 'Unknown error occurred');
      }
    } catch (error) {
      toast({
        title: "Research Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      console.error('Research error:', error);
    } finally {
      setRunningResearch(null);
    }
  };

  const viewResearchHistory = async (competitorId: number) => {
    try {
      const response = await fetch(`/api/admin/competitors/${competitorId}/research-history`);
      const data = await response.json();
      
      if (data.status === 'success') {
        setResearchHistory(data.data);
        setSelectedCompetitor(competitorId);
      }
    } catch (error) {
      console.error('Failed to fetch research history:', error);
    }
  };

  // Show loading state while checking auth
  if (userLoading || isLoading) {
    return (
      <Layout>
        <div className="container py-6">
          <div className="flex items-center justify-center min-h-[200px]">
            <p>Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Don't render anything if not authenticated
  if (!user) {
    return null;
  }

  if (error) {
    return (
      <Layout>
        <div className="container py-6">
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">User Competitors</h1>
        
        {competitors.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground">
            No competitors found for this user.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Selected</TableHead>
                  <TableHead>Added On</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((competitor) => (
                  <TableRow 
                    key={competitor.id}
                    className={cn(
                      !competitor.isSelected && "opacity-60 bg-muted/50",
                      competitor.isSelected && "bg-blue-50/50"
                    )}
                  >
                    <TableCell className="font-medium">
                      {competitor.name}
                    </TableCell>
                    <TableCell>
                      <a
                        href={competitor.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {competitor.website}
                      </a>
                    </TableCell>
                    <TableCell>Active</TableCell>
                    <TableCell>
                      {competitor.isSelected ? "Yes" : "No"}
                    </TableCell>
                    <TableCell>
                      {new Date(competitor.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={() => runWebsiteResearch(competitor.id, competitor.website)}
                        disabled={runningResearch === competitor.id}
                        variant="outline"
                        size="sm"
                      >
                        {runningResearch === competitor.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Running...
                          </>
                        ) : (
                          "Run Website Research Module"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
