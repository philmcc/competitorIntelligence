import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "../hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "../hooks/use-user";
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useState } from "react";
import { Loader2 } from "lucide-react";

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
    priceId: "price_1QKMCnF9UgNcgnl1JU0CluL0",
    features: [
      "Track up to 15 competitors",
      "Access to all modules",
      "All competitor fields",
      "Priority support"
    ]
  }
};

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Stripe public key is not configured');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface SubscriptionError {
  message: string;
  errors?: Record<string, string[]>;
}

interface SubscriptionResponse {
  status: string;
  data: {
    subscriptionId: string;
    clientSecret: string;
  };
}

function PaymentForm({ clientSecret, onSuccess, onError }: { 
  clientSecret: string; 
  onSuccess: () => void;
  onError: (error: Error) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard`,
        },
        redirect: 'if_required',
      });

      if (error) {
        throw error;
      }

      if (paymentIntent.status === 'succeeded') {
        onSuccess();
      } else {
        throw new Error('Payment was not completed successfully');
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Payment failed'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button 
        type="submit" 
        disabled={!stripe || isProcessing}
        className="w-full"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          "Pay Now"
        )}
      </Button>
    </form>
  );
}

export default function SubscriptionManagement() {
  const { subscription, subscribe, cancelSubscription } = useSubscription();
  const { user, mutate: mutateUser } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const handleSubscribe = async () => {
    try {
      setIsLoading(true);

      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId: PLANS.PRO.priceId }),
      });

      if (!response.ok) {
        const errorData = await response.json() as SubscriptionError;
        throw new Error(errorData.message || 'Failed to create subscription');
      }

      const { data } = await response.json() as SubscriptionResponse;
      setClientSecret(data.clientSecret);
    } catch (error) {
      console.error('Subscription error:', error);
      toast({
        title: "Subscription Failed",
        description: error instanceof Error ? error.message : "Failed to process subscription",
        variant: "destructive",
      });
      setClientSecret(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    try {
      await mutateUser();
      toast({
        title: "Success",
        description: "Your subscription has been activated successfully!",
      });
    } catch (error) {
      console.error('Failed to update user data:', error);
      toast({
        title: "Warning",
        description: "Subscription activated but failed to refresh user data. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setClientSecret(null);
    }
  };

  const handlePaymentError = (error: Error) => {
    console.error('Payment error:', error);
    toast({
      title: "Payment Failed",
      description: error.message,
      variant: "destructive",
    });
  };

  const handleCancel = async () => {
    try {
      setIsLoading(true);
      const result = await cancelSubscription();
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to cancel subscription');
      }

      toast({
        title: "Subscription Cancelled",
        description: "Your subscription will remain active until the end of the current billing period.",
      });

      try {
        await mutateUser();
      } catch (error) {
        console.error('Failed to update user data:', error);
        toast({
          title: "Warning",
          description: "Subscription cancelled but failed to refresh user data. Please refresh the page.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Cancellation error:', error);
      toast({
        title: "Cancellation Failed",
        description: error instanceof Error ? error.message : "Failed to cancel subscription",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
          {clientSecret && (
            <div className="mt-4">
              <Elements stripe={stripePromise} options={{ 
                clientSecret,
                appearance: {
                  theme: 'stripe'
                }
              }}>
                <PaymentForm
                  clientSecret={clientSecret}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </Elements>
            </div>
          )}
        </CardContent>
        <CardFooter>
          {isPro ? (
            <Button 
              variant="destructive" 
              onClick={handleCancel}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel Subscription"
              )}
            </Button>
          ) : (
            !clientSecret && (
              <Button 
                onClick={handleSubscribe}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Upgrade to Pro"
                )}
              </Button>
            )
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
