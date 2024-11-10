import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCompetitors } from "../hooks/use-competitors";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const discoverySchema = z.object({
  industry: z.string().min(1, "Industry is required"),
  keywords: z.string().min(1, "At least one keyword is required")
});

type DiscoveryForm = z.infer<typeof discoverySchema>;

type DiscoveredCompetitor = {
  name: string;
  website: string;
  reason: string;
};

export default function DiscoverCompetitorsDialog() {
  const { addCompetitor } = useCompetitors();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [discoveredCompetitors, setDiscoveredCompetitors] = useState<DiscoveredCompetitor[]>([]);

  const form = useForm<DiscoveryForm>({
    resolver: zodResolver(discoverySchema),
    defaultValues: {
      industry: "",
      keywords: "",
    }
  });

  const handleDiscover = async (data: DiscoveryForm) => {
    setLoading(true);

    try {
      const response = await fetch("/api/competitors/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: data.industry,
          keywords: data.keywords.split(",").map(k => k.trim()),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to discover competitors");
      }

      const competitors = await response.json();
      setDiscoveredCompetitors(competitors);
    } catch (error) {
      toast({
        title: "Error discovering competitors",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompetitor = async (competitor: DiscoveredCompetitor) => {
    const result = await addCompetitor(competitor);
    if (result.ok) {
      toast({ title: "Competitor added successfully" });
    } else {
      toast({
        title: "Error adding competitor",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Discover Competitors</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Discover Competitors</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleDiscover)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              {...form.register("industry")}
              placeholder="e.g., Software, Healthcare, Retail"
            />
            {form.formState.errors.industry && (
              <p className="text-sm text-destructive">
                {form.formState.errors.industry.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords (comma-separated)</Label>
            <Input
              id="keywords"
              {...form.register("keywords")}
              placeholder="e.g., cloud computing, AI, machine learning"
            />
            {form.formState.errors.keywords && (
              <p className="text-sm text-destructive">
                {form.formState.errors.keywords.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Discovering..." : "Discover"}
          </Button>
        </form>

        {discoveredCompetitors.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold">Discovered Competitors</h3>
            <div className="space-y-3">
              {discoveredCompetitors.map((competitor, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold">{competitor.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {competitor.website}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {competitor.reason}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddCompetitor(competitor)}
                    >
                      Add
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
