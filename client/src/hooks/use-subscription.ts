import useSWR, { mutate } from "swr";
import type { Subscription } from "db/schema";

export function useSubscription() {
  const { data: subscription, error } = useSWR<Subscription>("/api/subscriptions/status");

  const subscribe = async (priceId: string) => {
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      
      if (!response.ok) throw new Error("Failed to create subscription");
      
      const data = await response.json();
      await mutate("/api/subscriptions/status");
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };

  const cancelSubscription = async () => {
    try {
      const response = await fetch("/api/subscriptions", {
        method: "DELETE",
      });
      
      if (!response.ok) throw new Error("Failed to cancel subscription");
      
      await mutate("/api/subscriptions/status");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };

  return {
    subscription,
    isLoading: !error && !subscription,
    error,
    subscribe,
    cancelSubscription,
  };
}
