import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  competitorId: number;
}

export default function WebsiteResearch({ competitorId }: Props) {
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const handleResearch = async () => {
    setRunning(true);
    try {
      const response = await fetch(`/api/admin/competitors/${competitorId}/research`, {
        method: "POST",
      });
      
      const data = await response.json();
      
      if (data.status === "success") {
        toast({
          title: "Research Complete",
          description: data.data.changesMade ? 
            `Changes detected: ${data.data.changeDetails}` : 
            "No changes detected",
        });
      } else {
        throw new Error(data.message || "Failed to run research");
      }
    } catch (error) {
      toast({
        title: "Research Failed",
        description: error instanceof Error ? error.message : "Failed to run research",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Website Research</CardTitle>
          <Button onClick={handleResearch} disabled={running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Research...
              </>
            ) : (
              "Run Research"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Add any additional content or research history here */}
      </CardContent>
    </Card>
  );
} 