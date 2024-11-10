import useSWR, { mutate } from "swr";
import type { Competitor, InsertCompetitor } from "db/schema";

export function useCompetitors() {
  const { data: competitors, error } = useSWR<Competitor[]>("/api/competitors");

  const addCompetitor = async (competitor: Omit<InsertCompetitor, "userId" | "isActive">) => {
    try {
      const response = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(competitor),
      });
      
      if (!response.ok) throw new Error("Failed to add competitor");
      
      await mutate("/api/competitors");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };

  const updateCompetitor = async (id: number, competitor: Partial<InsertCompetitor>) => {
    try {
      const response = await fetch(`/api/competitors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(competitor),
      });
      
      if (!response.ok) throw new Error("Failed to update competitor");
      
      await mutate("/api/competitors");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };

  const deleteCompetitor = async (id: number) => {
    try {
      const response = await fetch(`/api/competitors/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) throw new Error("Failed to delete competitor");
      
      await mutate("/api/competitors");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };

  return {
    competitors,
    isLoading: !error && !competitors,
    error,
    addCompetitor,
    updateCompetitor,
    deleteCompetitor,
  };
}
