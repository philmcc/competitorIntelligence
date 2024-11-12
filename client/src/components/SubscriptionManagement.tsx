import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "../hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "../hooks/use-user";
import { loadStripe } from '@stripe/stripe-js';

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
    priceId: "price_1OqXYRKJ8HgDX4Y6bG7pN3Dq", // Standard price ID format
    features: [
      "Track up to 15 competitors",
      "Access to all modules",
      "All competitor fields",
      "Priority support"
    ]
  }
};

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

export default function SubscriptionManagement() {
  const { subscription, subscribe, cancelSubscription } = useSubscription();
  const { user, mutate: mutateUser } = useUser();
  const { toast } = useToast();

  const handleSubscribe = async () => {
    try {
      if (!stripePromise) {
        throw new Error("Stripe is not properly configured");
      }

      const result = await subscribe(PLANS.PRO.priceId);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const { clientSecret } = result.data;
      const stripe = await stripePromise;
      
      if (!stripe) {
        throw new Error("Failed to initialize Stripe");
      }

      const { error: paymentError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: {
            token: 'tok_visa' // Test token, will be replaced with actual card details in production
          }
        }
      });
      
      if (paymentError) {
        throw new Error(paymentError.message || "Payment failed");
      }

      if (paymentIntent?.status === 'succeeded') {
        toast({
          title: "Success",
          description: "Your subscription has been activated successfully!",
        });
        // Refresh user data to update the plan
        mutateUser();
      } else {
        throw new Error("Payment was not completed successfully");
      }
    } catch (error) {
      console.error('Subscription error:', error);
      toast({
        title: "Subscription Failed",
        description: error instanceof Error ? error.message : "Failed to process subscription. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    try {
      const result = await cancelSubscription();
      if (!result.ok) {
        throw new Error(result.error);
      }

      toast({
        title: "Subscription Cancelled",
        description: "Your subscription will remain active until the end of the current billing period.",
      });

      // Refresh user data to update the plan
      mutateUser();
    } catch (error) {
      console.error('Cancellation error:', error);
      toast({
        title: "Cancellation Failed",
        description: error instanceof Error ? error.message : "Failed to cancel subscription. Please try again.",
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
