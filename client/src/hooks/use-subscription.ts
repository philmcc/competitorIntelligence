import useSWR, { mutate } from "swr";
import type { Subscription } from "db/schema";

type ApiResponse<T> = {
  status: "success" | "error";
  data?: T;
  message?: string;
  errors?: any[];
};

export function useSubscription() {
  const { data, error } = useSWR<ApiResponse<Subscription>>("/api/subscriptions/status");

  const subscribe = async (priceId: string) => {
    try {
      const response = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      
      const result: ApiResponse<any> = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || "Failed to create subscription");
      }
      
      await mutate("/api/subscriptions/status");
      return { ok: true, data: result.data };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };

  const cancelSubscription = async () => {
    try {
      const response = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      const result: ApiResponse<void> = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || "Failed to cancel subscription");
      }
      
      await mutate("/api/subscriptions/status");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };

  return {
    subscription: data?.data,
    isLoading: !error && !data,
    error,
    subscribe,
    cancelSubscription,
  };
}
