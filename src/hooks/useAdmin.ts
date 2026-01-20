import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/integrations/api/repo";

interface UserInfo {
  id: number;
  email: string;
  isAdmin: boolean;
}

export function useAdmin() {
  const { data: userInfo, isLoading, isRefetching, error } = useQuery<UserInfo>({
    queryKey: ["user", "me"],
    queryFn: async () => {
      try {
        return await fetchJson<UserInfo>("/api/auth/me");
      } catch (err: any) {
        // If 401 (not authenticated) or 404 (endpoint not found/backend not ready), 
        // treat as not logged in rather than throwing error
        if (err.message?.includes("401") || err.message?.includes("404") || err.message?.includes("Authentication required")) {
          return null as any; // Return null to indicate not logged in
        }
        throw err; // Re-throw other errors
      }
    },
    retry: (failureCount, error: any) => {
      // Don't retry on 401/404 errors (not logged in or backend not ready)
      if (error?.message?.includes("401") || error?.message?.includes("404") || error?.message?.includes("Authentication required")) {
        return false;
      }
      // Retry once for other errors
      return failureCount < 1;
    },
    staleTime: 0, // Always consider data stale to refetch on mount
    gcTime: 0, // Don't cache at all - always fetch fresh
    refetchOnMount: "always", // Ensure refetch on component mount
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true, // Refetch on reconnect
  });

  return {
    isAdmin: userInfo?.isAdmin ?? false,
    isLoading: isLoading || isRefetching, // Consider loading if fetching or refetching
    userInfo: userInfo || null,
    error,
  };
}

