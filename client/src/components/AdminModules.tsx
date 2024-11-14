import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Module {
  id: string;
  name: string;
  description: string;
  availableOnFree: boolean;
  isActive: boolean;
}

export default function AdminModules() {
  const { toast } = useToast();
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newModule, setNewModule] = useState({
    name: "",
    description: "",
    availableOnFree: false
  });

  const handleUpdateModule = async (moduleId: string, updates: Partial<Module>) => {
    try {
      const response = await fetch(`/api/admin/modules/${moduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error("Failed to update module");
      }

      toast({
        title: "Success",
        description: "Module updated successfully"
      });

      // Refresh modules list
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

      if (!response.ok) {
        throw new Error("Failed to add module");
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

      // Refresh modules list
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

  return (
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
            <Card key={module.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{module.name}</h3>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
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
      </CardContent>
    </Card>
  );
} 