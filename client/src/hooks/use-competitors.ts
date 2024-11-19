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
  const { data, error } = useSWR<ApiResponse<Competitor[]>>("/api/competitors");

  const handleApiResponse = async <T>(response: Response): Promise<ApiResult<T>> => {
    const result: ApiResponse<T> = await response.json();
    
    if (result.status === "error") {
      return {
        ok: false,
        message: result.message || "An error occurred",
        errors: result.errors
      };
    }
    
    return { ok: true, data: result.data, meta: result.meta };
  };

  const addCompetitor = async (competitor: Omit<InsertCompetitor, "userId" | "isActive">) => {
    try {
      const response = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(competitor),
      });
      
      const result = await handleApiResponse<Competitor>(response);
      if (result.ok) {
        await mutate("/api/competitors");
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "An unexpected error occurred"
      };
    }
  };

  const updateCompetitor = async (id: number, competitor: Partial<InsertCompetitor>) => {
    try {
      const response = await fetch(`/api/competitors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(competitor),
      });
      
      const result = await handleApiResponse<Competitor>(response);
      if (result.ok) {
        await mutate("/api/competitors");
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "An unexpected error occurred"
      };
    }
  };

  const deleteCompetitor = async (id: number) => {
    try {
      const response = await fetch(`/api/competitors/${id}`, {
        method: "DELETE",
      });
      
      const result = await handleApiResponse<void>(response);
      if (result.ok) {
        await mutate("/api/competitors");
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "An unexpected error occurred"
      };
    }
  };

  return {
    competitors: data?.data || [],
    meta: data?.meta,
    isLoading: !error && !data,
    error: error ? {
      message: "Failed to fetch competitors",
      cause: error
    } : undefined,
    addCompetitor,
    updateCompetitor,
    deleteCompetitor,
  };
}
