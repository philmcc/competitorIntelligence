import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  competitorId: number;
}

export default function TrustpilotAnalysis({ competitorId }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleAnalysis = async () => {
    setAnalyzing(true);
    try {
      const response = await fetch(`/api/competitors/${competitorId}/trustpilot`, {
        method: "POST",
      });
      
      if (!response.ok) {
        throw new Error("Failed to analyze Trustpilot reviews");
      }
      
      const data = await response.json();
      toast({
        title: "Analysis Complete",
        description: "Trustpilot review analysis has been completed successfully.",
      });
      
      // Refresh the research runs data
      // You might want to trigger a refresh of the parent component
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to analyze Trustpilot reviews. Please try again.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Trustpilot Reviews</CardTitle>
          <Button onClick={handleAnalysis} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Analyze Reviews"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Display analysis results here */}
      </CardContent>
    </Card>
  );
} 