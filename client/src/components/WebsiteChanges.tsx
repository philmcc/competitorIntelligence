import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface WebsiteChange {
  id: number;
  competitorId: number;
  snapshotDate: string;
  changes: any[];
  changeType: string;
  isReported: boolean;
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
          description: result.data ? "Changes detected and recorded" : "No changes detected"
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
                {change.changes && (
                  <div className="mt-2 text-sm">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(change.changes, null, 2)}
                    </pre>
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
