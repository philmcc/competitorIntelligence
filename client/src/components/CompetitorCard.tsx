import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCompetitors } from "../hooks/use-competitors";
import type { Competitor } from "db/schema";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function CompetitorCard({ competitor }: { competitor: Competitor }) {
  const { updateCompetitor, deleteCompetitor, meta } = useCompetitors();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(competitor);

  const handleSave = async () => {
    const result = await updateCompetitor(competitor.id, formData);
    if (result.ok) {
      setIsEditing(false);
      toast({ title: "Competitor updated successfully" });
    } else {
      toast({
        title: "Error updating competitor",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    const result = await deleteCompetitor(competitor.id);
    if (result.ok) {
      toast({ title: "Competitor deleted successfully" });
    } else {
      toast({
        title: "Error deleting competitor",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-semibold">
          {isEditing ? (
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Switch
                checked={competitor.isSelected}
                onCheckedChange={async () => {
                  if (!competitor.isSelected && meta?.remaining === 0) {
                    toast({
                      title: "Plan limit reached",
                      description: "You've reached the maximum number of selected competitors for your plan. Please upgrade to select more.",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  const result = await updateCompetitor(competitor.id, {
                    ...competitor,
                    isSelected: !competitor.isSelected
                  });
                  if (!result.ok) {
                    toast({
                      title: "Error updating selection",
                      description: result.message,
                      variant: "destructive",
                    });
                  }
                }}
                disabled={false}
              />
              <span className={competitor.isSelected ? "opacity-100" : "opacity-50"}>
                {competitor.name}
              </span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isEditing ? (
            <>
              <Input
                value={formData.website}
                onChange={(e) =>
                  setFormData({ ...formData, website: e.target.value })
                }
              />
              <Input
                value={formData.reason || ""}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                placeholder="Reason for tracking"
              />
              <div className="flex gap-2">
                <Button onClick={handleSave}>Save</Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">
                Website:{" "}
                <a
                  href={competitor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  {competitor.website}
                </a>
              </p>
              {competitor.reason && (
                <p className="text-sm text-muted-foreground">
                  Reason: {competitor.reason}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
