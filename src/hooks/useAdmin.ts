import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/integrations/api/repo";

interface UserInfo {
  id: number;
  email: string;
  isAdmin: boolean;
}

export function useAdmin() {
  const { data: userInfo, isLoading, isFetching, error } = useQuery<UserInfo>({
    queryKey: ["user", "me"],
    queryFn: () => fetchJson<UserInfo>("/api/auth/me"),
    retry: 1,
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes - admin status doesn't change often
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
    refetchOnMount: false, // Don't refetch if data exists (use cache)
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: true, // Only refetch on reconnect
  });

  // Only show loading on initial fetch (when no data exists)
  // React Query will deduplicate multiple simultaneous requests automatically
  const isActuallyLoading = isLoading && !userInfo;

  return {
    isAdmin: userInfo?.isAdmin ?? false,
    isLoading: isActuallyLoading,
    userInfo,
    error,
  };
}

