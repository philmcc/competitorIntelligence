import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useResearchModules } from "@/hooks/use-research-modules";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminModules() {
  const { modules, isLoading, updateModule } = useResearchModules();
  const { toast } = useToast();
  const [moduleStats, setModuleStats] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchModuleStats = async () => {
      try {
        const response = await fetch('/api/admin/modules/stats');
        const data = await response.json();
        if (data.status === 'success') {
          setModuleStats(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch module statistics:', error);
      }
    };

    fetchModuleStats();
  }, []);

  const handleUpdateModule = async (moduleId: string, updates: any) => {
    const result = await updateModule(moduleId, updates);
    if (result.status === 'success') {
      toast({
        title: "Module updated successfully",
      });
    } else {
      toast({
        title: "Failed to update module",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <ModulesSkeleton />;
  }

  return (
    <div className="space-y-4">
      {modules.map((module) => (
        <Card key={module.id}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{module.name}</h3>
                  <Badge variant={module.isActive ? "default" : "secondary"}>
                    {module.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {module.availableOnFree && (
                    <Badge variant="outline">Free Plan</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{module.description}</p>
                <p className="text-sm text-muted-foreground">
                  Active Users: {moduleStats[module.id] || 0}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={module.availableOnFree}
                    onCheckedChange={(checked) => handleUpdateModule(module.id, { availableOnFree: checked })}
                  />
                  <span className="text-sm">Free Plan</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={module.isActive}
                    onCheckedChange={(checked) => handleUpdateModule(module.id, { isActive: checked })}
                  />
                  <span className="text-sm">Active</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ModulesSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <Skeleton className="h-[100px] w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
