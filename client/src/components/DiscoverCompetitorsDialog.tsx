import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCompetitors } from "../hooks/use-competitors";
import { useUser } from "../hooks/use-user";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const discoverySchema = z.object({
  websiteUrl: z.string()
    .url("Please enter a valid URL")
    .refine(url => url.startsWith('http://') || url.startsWith('https://'), 
      "URL must start with http:// or https://")
});

type DiscoveryForm = z.infer<typeof discoverySchema>;

type DiscoveredCompetitor = {
  name: string;
  website: string;
  reason: string;
};

export default function DiscoverCompetitorsDialog() {
  const { addCompetitor } = useCompetitors();
  const { user } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [discoveredCompetitors, setDiscoveredCompetitors] = useState<DiscoveredCompetitor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingCompetitor, setAddingCompetitor] = useState<string | null>(null);

  const form = useForm<DiscoveryForm>({
    resolver: zodResolver(discoverySchema),
    defaultValues: {
      websiteUrl: user?.websiteUrl || "",
    }
  });

  // Update form when user data changes
  useEffect(() => {
    if (user?.websiteUrl) {
      form.setValue("websiteUrl", user.websiteUrl);
    }
  }, [user?.websiteUrl, form]);

  const handleDiscover = async (data: DiscoveryForm) => {
    setLoading(true);
    setError(null);
    setDiscoveredCompetitors([]);

    try {
      const response = await fetch("/api/competitors/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: data.websiteUrl,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned non-JSON response");
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || "Failed to discover competitors");
      }

      // Handle the standardized API response format
      if (result.status !== "success" || !Array.isArray(result.data)) {
        throw new Error("Invalid response format from server");
      }

      setDiscoveredCompetitors(result.data);
    
      if (result.data.length === 0) {
        setError("No competitors were found for the provided website. Try a different URL or add competitors manually.");
      } else {
        toast({
          title: "Competitors discovered",
          description: `Found ${result.data.length} potential competitors.`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setError(errorMessage);
      toast({
        title: "Error discovering competitors",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompetitor = async (competitor: DiscoveredCompetitor) => {
    setAddingCompetitor(competitor.website);
    try {
      const result = await addCompetitor(competitor);
      if (result.ok) {
        toast({ 
          title: "Competitor added successfully",
          description: `${competitor.name} has been added to your competitors list.`
        });
        setDiscoveredCompetitors(prev => 
          prev.filter(c => c.website !== competitor.website)
        );
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to add competitor";
      toast({
        title: "Error adding competitor",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setAddingCompetitor(null);
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
          <DialogDescription>
            {user?.websiteUrl 
              ? "Using your website URL to discover potential competitors in your industry."
              : "Enter your website URL to discover potential competitors in your industry."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleDiscover)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Your Website URL</Label>
            <Input
              id="websiteUrl"
              {...form.register("websiteUrl")}
              placeholder="https://www.example.com"
              type="url"
              disabled={loading}
            />
            {form.formState.errors.websiteUrl && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {form.formState.errors.websiteUrl.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Discovering competitors...
              </>
            ) : (
              "Discover Competitors"
            )}
          </Button>
        </form>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {discoveredCompetitors.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold">
              Discovered Competitors ({discoveredCompetitors.length})
            </h3>
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
                      disabled={addingCompetitor === competitor.website}
                    >
                      {addingCompetitor === competitor.website ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Add"
                      )}
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