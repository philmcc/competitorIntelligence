import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Settings {
  id: number;
  moduleId: number;
  name: string;
  value: {
    model: string;
    prompt_template: string;
    schedule: string;
  };
}

interface Props {
  moduleId: number;
}

export default function ResearchModuleSettings({ moduleId }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, [moduleId]);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`/api/admin/settings/${moduleId}`);
      const result = await response.json();
      
      if (result.status === "success" && result.data.length > 0) {
        setSettings(result.data[0]);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/settings/${moduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId,
          name: settings.name,
          value: settings.value
        })
      });

      const result = await response.json();
      
      if (result.status === "success") {
        toast({
          title: "Success",
          description: "Settings updated successfully"
        });
        setSettings(result.data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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

  if (!settings) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module Settings</CardTitle>
        <CardDescription>
          Configure OpenAI model, prompt template, and scheduling for website change tracking
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">OpenAI Model</label>
            <Input
              value={settings.value.model}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  value: { ...settings.value, model: e.target.value }
                })
              }
              placeholder="gpt-4"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt Template</label>
            <textarea
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={settings.value.prompt_template}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  value: { ...settings.value, prompt_template: e.target.value }
                })
              }
              placeholder="Enter prompt template..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Schedule (Cron Expression)</label>
            <Input
              value={settings.value.schedule}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  value: { ...settings.value, schedule: e.target.value }
                })
              }
              placeholder="0 */6 * * *"
            />
            <p className="text-xs text-muted-foreground">
              Default: Every 6 hours (0 */6 * * *)
            </p>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
