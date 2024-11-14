import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ResearchModuleSettings from "./ResearchModuleSettings";

interface Module {
  id: string;
  name: string;
  description: string;
  availableOnFree: boolean;
  isActive: boolean;
  userCount: number;
}

export default function AdminModules() {
  const { toast } = useToast();
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [newModule, setNewModule] = useState({
    name: "",
    description: "",
    availableOnFree: false
  });

  const fetchModules = async () => {
    try {
      const response = await fetch("/api/admin/modules", {
        credentials: "include"
      });
      const result = await response.json();
      
      if (result.status === "success") {
        setModules(result.data);
      } else {
        throw new Error(result.message || "Failed to fetch modules");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch modules",
        variant: "destructive"
      });
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const handleUpdateModule = async (moduleId: string, updates: Partial<Module>) => {
    try {
      const response = await fetch(`/api/admin/modules/${moduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates)
      });

      const result = await response.json();
      if (result.status !== "success") {
        throw new Error(result.message || "Failed to update module");
      }

      toast({
        title: "Success",
        description: "Module updated successfully"
      });

      fetchModules();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update module",
        variant: "destructive"
      });
    }
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newModule)
      });

      const result = await response.json();
      if (result.status !== "success") {
        throw new Error(result.message || "Failed to add module");
      }

      toast({
        title: "Success",
        description: "Module added successfully"
      });

      setNewModule({
        name: "",
        description: "",
        availableOnFree: false
      });

      fetchModules();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add module",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Research Modules</CardTitle>
          <CardDescription>
            Manage research modules and their availability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAddModule} className="space-y-4">
            <div className="grid gap-4">
              <Input
                placeholder="Module Name"
                value={newModule.name}
                onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
                required
              />
              <Input
                placeholder="Description"
                value={newModule.description}
                onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
                required
              />
              <div className="flex items-center space-x-2">
                <Switch
                  checked={newModule.availableOnFree}
                  onCheckedChange={(checked) => setNewModule({ ...newModule, availableOnFree: checked })}
                />
                <span>Available on Free Plan</span>
              </div>
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Module"
              )}
            </Button>
          </form>

          <div className="space-y-4">
            {modules.map((module) => (
              <div key={module.id} className="space-y-4">
                <Card>
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
                          Users: {module.userCount}
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedModule(selectedModule === module.id ? null : module.id)}
                        >
                          {selectedModule === module.id ? "Hide Settings" : "Show Settings"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {selectedModule === module.id && (
                  <ResearchModuleSettings moduleId={module.id} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}