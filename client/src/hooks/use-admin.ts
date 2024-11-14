import useSWR from "swr";
import { useUser } from "./use-user";
import type { User } from "db/schema";

interface Statistics {
  users: {
    totalUsers: number;
    freeUsers: number;
    proUsers: number;
  };
  competitors: {
    totalCompetitors: number;
    activeCompetitors: number;
    selectedCompetitors: number;
  };
}

interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

export function useAdmin() {
  const { user } = useUser();
  
  const { data: users, error: usersError, mutate: mutateUsers } = useSWR<ApiResponse<User[]>>(
    user?.isAdmin ? "/api/admin/users" : null
  );

  const { data: statistics, error: statsError } = useSWR<ApiResponse<Statistics>>(
    user?.isAdmin ? "/api/admin/statistics" : null
  );

  return {
    users,
    statistics,
    isLoading: (!users && !usersError) || (!statistics && !statsError),
    isError: !!usersError || !!statsError,
    updateUser: async (userId: number, updates: Partial<User>) => {
      try {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(updates)
        });

        if (!response.ok) {
          throw new Error("Failed to update user");
        }

        await mutateUsers();
        return { ok: true };
      } catch (error) {
        return { 
          ok: false, 
          message: error instanceof Error ? error.message : "Failed to update user" 
        };
      }
    }
  };
}
