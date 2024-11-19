import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ResearchRun {
  id: number;
  moduleId: string;
  runDate: string;
  result: any;
  changesMade?: boolean;
  changeDetails?: string;
}

interface Props {
  runs: ResearchRun[];
}

export function ResearchHistory({ runs }: Props) {
  if (!runs || runs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4">
        No research history available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <Card key={run.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {run.moduleId === "trustpilot" ? "Trustpilot Analysis" : "Website Research"}
              </CardTitle>
              <Badge variant={run.moduleId === "trustpilot" ? "secondary" : "default"}>
                {new Date(run.runDate).toLocaleDateString()}
              </Badge>
            </div>
            <CardDescription>
              {new Date(run.runDate).toLocaleTimeString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {run.moduleId === "trustpilot" ? (
              <div className="space-y-2">
                {/* Display Trustpilot analysis results */}
                <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg overflow-auto">
                  {JSON.stringify(run.result, null, 2)}
                </pre>
              </div>
            ) : (
              // Website research display
              <div className="space-y-2">
                {run.changesMade ? (
                  <>
                    <Badge variant="destructive">Changes Detected</Badge>
                    <p className="text-sm mt-2">{run.changeDetails}</p>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">No Changes</Badge>
                    <p className="text-sm mt-2">No changes were detected on the website</p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 