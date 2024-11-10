import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUser } from "../hooks/use-user";

const modules = [
  {
    id: "website-changes",
    name: "Website Change Tracking",
    description: "Monitor changes to competitor websites",
    availableOnFree: true,
  },
  {
    id: "trustpilot",
    name: "Trustpilot Review Monitoring",
    description: "Track new reviews and ratings on Trustpilot",
    availableOnFree: true,
  },
  {
    id: "social-media",
    name: "Social Media Monitoring",
    description: "Track social media presence and engagement",
    availableOnFree: false,
  },
  {
    id: "seo",
    name: "SEO Analysis",
    description: "Monitor SEO performance and rankings",
    availableOnFree: false,
  },
];

export default function ResearchModules() {
  const { user } = useUser();
  const isFreeUser = user?.plan === "free";

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {modules.map((module) => (
        <Card key={module.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{module.name}</span>
              <Switch
                disabled={isFreeUser && !module.availableOnFree}
                defaultChecked={module.availableOnFree}
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
