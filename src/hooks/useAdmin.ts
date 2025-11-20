import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/integrations/api/repo";

interface UserInfo {
  id: number;
  email: string;
  isAdmin: boolean;
}

export function useAdmin() {
  const { data: userInfo, isLoading, isFetching, isRefetching, error } = useQuery<UserInfo>({
    queryKey: ["user", "me"],
    queryFn: () => fetchJson<UserInfo>("/api/auth/me"),
    retry: 1,
    staleTime: 0, // Always consider data stale to force refetch
    refetchOnMount: "always", // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // Consider loading if:
  // 1. Initial load (isLoading) - no data yet
  // 2. Refetching on mount (isRefetching) - wait for fresh data after mount
  // This ensures we always get fresh admin status and don't show stale cached data
  const isActuallyLoading = isLoading || isRefetching;

  return {
    isAdmin: userInfo?.isAdmin ?? false,
    isLoading: isActuallyLoading,
    userInfo,
    error,
  };
}

