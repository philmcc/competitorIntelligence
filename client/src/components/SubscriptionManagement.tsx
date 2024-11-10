import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "../hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "../hooks/use-user";

const PLANS = {
  FREE: {
    name: "Free Plan",
    features: [
      "Track up to 3 competitors",
      "Basic modules only",
      "Limited competitor fields"
    ]
  },
  PRO: {
    name: "Pro Plan",
    price: "$49/month",
    priceId: "price_pro", // Replace with actual Stripe price ID
    features: [
      "Track up to 15 competitors",
      "Access to all modules",
      "All competitor fields",
      "Priority support"
    ]
  }
};

export default function SubscriptionManagement() {
  const { subscription, subscribe, cancelSubscription } = useSubscription();
  const { user } = useUser();
  const { toast } = useToast();

  const handleSubscribe = async () => {
    const result = await subscribe(PLANS.PRO.priceId);
    if (result.ok) {
      toast({
        title: "Success",
        description: "Your subscription has been created. You will be redirected to complete the payment.",
      });
      // Redirect to Stripe checkout or handle client-side payment
    } else {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    const result = await cancelSubscription();
    if (result.ok) {
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription will remain active until the end of the current billing period.",
      });
    } else {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const isPro = user?.plan === "pro";

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{PLANS.FREE.name}</CardTitle>
          <CardDescription>For individuals and small teams</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {PLANS.FREE.features.map((feature, i) => (
              <li key={i} className="flex items-center">
                <svg
                  className="mr-2 h-4 w-4 text-primary"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          <Button variant="outline" disabled>
            Current Plan
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{PLANS.PRO.name}</CardTitle>
          <CardDescription>For businesses serious about competitor tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <span className="text-3xl font-bold">{PLANS.PRO.price}</span>
          </div>
          <ul className="space-y-2">
            {PLANS.PRO.features.map((feature, i) => (
              <li key={i} className="flex items-center">
                <svg
                  className="mr-2 h-4 w-4 text-primary"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          {isPro ? (
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Subscription
            </Button>
          ) : (
            <Button onClick={handleSubscribe}>
              Upgrade to Pro
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
