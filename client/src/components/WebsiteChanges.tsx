import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowUpRight } from "lucide-react";

interface WebsiteChange {
  id: number;
  competitorId: number;
  snapshotDate: string;
  changes: any[];
  changeType: string;
  isReported: boolean;
  aiAnalysis?: {
    summary: string;
    timestamp: string;
  };
}

interface Props {
  competitorId: number;
}

export default function WebsiteChanges({ competitorId }: Props) {
  const [changes, setChanges] = useState<WebsiteChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const { toast } = useToast();

  const fetchChanges = async () => {
    try {
      const response = await fetch(`/api/competitors/${competitorId}/changes`);
      const result = await response.json();
      if (result.status === "success") {
        setChanges(result.data);
      }
    } catch (error) {
      console.error("Error fetching changes:", error);
    }
  };

  useEffect(() => {
    fetchChanges();
  }, [competitorId]);

  const handleTrackChanges = async () => {
    setTracking(true);
    try {
      const response = await fetch(`/api/competitors/${competitorId}/track`, {
        method: "POST"
      });
      const result = await response.json();
      
      if (result.status === "success") {
        toast({
          title: "Success",
          description: result.data ? "Changes detected and analyzed" : "No changes detected"
        });
        await fetchChanges();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to track changes",
        variant: "destructive"
      });
    } finally {
      setTracking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Website Changes</CardTitle>
          <Button onClick={handleTrackChanges} disabled={tracking}>
            {tracking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tracking...
              </>
            ) : (
              "Track Changes"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <p className="text-center text-muted-foreground">No changes detected yet</p>
        ) : (
          <div className="space-y-4">
            {changes.map((change) => (
              <div key={change.id} className="border p-4 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {new Date(change.snapshotDate).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Type: {change.changeType}
                    </p>
                  </div>
                  {change.changes && (
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                      {change.changes.length} changes
                    </span>
                  )}
                </div>
                {change.aiAnalysis && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      AI Analysis
                      <ArrowUpRight className="h-4 w-4" />
                    </h4>
                    <p className="text-sm whitespace-pre-wrap">
                      {change.aiAnalysis.summary}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Analyzed at: {new Date(change.aiAnalysis.timestamp).toLocaleString()}
                    </p>
                  </div>
                )}
                {change.changes && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Raw Changes</h4>
                    <div className="text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                      <pre className="whitespace-pre-wrap">
                        {change.changes.map((c: any, i: number) => (
                          <span
                            key={i}
                            className={
                              c.added
                                ? "text-green-600 bg-green-50 px-1"
                                : c.removed
                                ? "text-red-600 bg-red-50 px-1"
                                : ""
                            }
                          >
                            {c.value}
                          </span>
                        ))}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
