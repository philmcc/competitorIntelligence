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
  websiteUrl: z.string().url("Please enter a valid URL")
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
      websiteUrl: "",
    }
  });

  const handleDiscover = async (data: DiscoveryForm) => {
    setLoading(true);

    try {
      const response = await fetch("/api/competitors/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: data.websiteUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to discover competitors");
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
            <Label htmlFor="websiteUrl">Your Website URL</Label>
            <Input
              id="websiteUrl"
              {...form.register("websiteUrl")}
              placeholder="https://www.example.com"
              type="url"
            />
            {form.formState.errors.websiteUrl && (
              <p className="text-sm text-destructive">
                {form.formState.errors.websiteUrl.message}
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
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {discoveredCompetitors.map((competitor, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold">{competitor.name}</h4>
                      <a 
                        href={competitor.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline"
                      >
                        {competitor.website}
                      </a>
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
