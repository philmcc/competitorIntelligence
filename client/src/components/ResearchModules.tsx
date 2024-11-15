import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUser } from "../hooks/use-user";
import { useResearchModules } from "@/hooks/use-research-modules";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function ResearchModules() {
  const { user } = useUser();
  const { modules, isLoading, error, toggleModule } = useResearchModules();
  const { toast } = useToast();
  const isFreeUser = user?.plan === "free";

  const handleToggle = async (moduleId: string, enabled: boolean) => {
    if (isFreeUser && !modules.find(m => m.id === moduleId)?.availableOnFree) {
      toast({
        title: "Upgrade Required",
        description: "This module is only available on paid plans",
        variant: "destructive",
      });
      return;
    }

    const result = await toggleModule(moduleId, enabled);
    if (!result.ok) {
      toast({
        title: "Error",
        description: result.error || "Failed to update module settings",
        variant: "destructive",
      });
    }
  };

  if (isLoading) return <ModulesSkeleton />;
  if (error) return <div>Error loading modules</div>;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {modules.map((module) => (
        <Card key={module.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{module.name}</span>
              <Switch
                checked={module.isEnabled}
                onCheckedChange={(checked) => handleToggle(module.id, checked)}
                disabled={isFreeUser && !module.availableOnFree}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {module.description}
            </p>
            {isFreeUser && !module.availableOnFree && (
              <Label className="text-xs text-yellow-600 mt-2">
                Available on paid plans only
              </Label>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ModulesSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-[200px]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
