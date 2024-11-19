import useSWR, { mutate } from "swr";
import type { Competitor, InsertCompetitor } from "db/schema";

type ApiResponse<T> = {
  status: "success" | "error";
  data?: T;
  meta?: {
    total: number;
    limit: number;
    remaining: number;
  };
  message?: string;
  errors?: Array<{
    code: string;
    message: string;
    path: string[];
  }>;
};

type ApiError = {
  ok: false;
  message: string;
  errors?: Array<{
    code: string;
    message: string;
    path: string[];
  }>;
};

type ApiSuccess<T> = {
  ok: true;
  data?: T;
  meta?: {
    total: number;
    limit: number;
    remaining: number;
  };
};

type ApiResult<T> = ApiSuccess<T> | ApiError;

export function useCompetitors() {
  const { data, error, isLoading, mutate } = useSWR<CompetitorsResponse>(
    "/api/competitors",
    async (url) => {
      try {
        const response = await fetch(url);
        console.log("Competitors API response status:", response.status);
        
        const data = await response.json();
        console.log("Competitors API response data:", data);

        if (!response.ok) {
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        
        if (data.status !== "success") {
          throw new Error(data.message || "Failed to fetch competitors");
        }

        return data;
      } catch (error) {
        console.error("Error in competitors fetch:", error);
        throw error;
      }
    },
    {
      onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
        // Only retry up to 3 times
        if (retryCount >= 3) return;
        // Retry after 3 seconds
        setTimeout(() => revalidate({ retryCount }), 3000);
      },
    }
  );

  return {
    competitors: data?.data || [],
    isLoading,
    error: error ? {
      message: error instanceof Error ? error.message : "Failed to fetch competitors",
      details: error
    } : null,
    mutate,
  };
}
