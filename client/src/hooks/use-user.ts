import useSWR from "swr";
import type { User, InsertUser } from "db/schema";
import { useEffect } from 'react';
import { useLocation } from 'wouter';

type ApiResponse<T> = {
  status: "success" | "error";
  data?: T;
  message?: string;
};

export function useUser() {
  const { data, error, mutate } = useSWR<ApiResponse<User>>('/api/user', {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  const [, setLocation] = useLocation();

  // Add this effect to handle 401 responses
  useEffect(() => {
    if (error?.status === 401) {
      setLocation('/auth');
    }
  }, [error, setLocation]);

  return {
    user: data?.data,
    isLoading: !error && !data,
    error,
    mutate: async () => {
      try {
        await mutate();
      } catch (error) {
        console.error('Failed to update user data:', error);
        throw error;
      }
    },
    login: async (user: InsertUser) => {
      const res = await handleRequest("/login", "POST", user);
      await mutate();
      return res;
    },
    logout: async () => {
      const res = await handleRequest("/logout", "POST");
      await mutate(undefined);
      return res;
    },
    register: async (user: InsertUser) => {
      const res = await handleRequest("/register", "POST", user);
      await mutate();
      return res;
    },
  };
}

type RequestResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

async function handleRequest(
  url: string,
  method: string,
  body?: InsertUser
): Promise<RequestResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { ok: false, message: errorData.message };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.toString() };
  }
}
