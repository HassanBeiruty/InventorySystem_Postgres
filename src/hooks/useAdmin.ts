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
    queryFn: () => fetchJson<UserInfo>("/api/auth/me"),
    retry: 1,
    staleTime: 0, // Always consider data stale to refetch on mount
    refetchOnMount: "always", // Ensure refetch on component mount
  });

  return {
    isAdmin: userInfo?.isAdmin ?? false,
    isLoading: isLoading || isRefetching, // Consider loading if fetching or refetching
    userInfo,
    error,
  };
}

