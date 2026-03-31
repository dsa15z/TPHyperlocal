"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { isAuthenticated } from "@/lib/auth";
import {
  fetchUserProfile,
  type UserProfile,
  type MarketInfo,
  type UserPreferences,
} from "@/lib/api";

interface UserContextValue {
  profile: UserProfile | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  /** The account's markets */
  markets: MarketInfo[];
  /** User's news preferences for the current account */
  preferences: UserPreferences | null;
  /** Display title for the dashboard header */
  dashboardTitle: string;
}

const UserContext = createContext<UserContextValue>({
  profile: null,
  isLoading: false,
  isLoggedIn: false,
  markets: [],
  preferences: null,
  dashboardTitle: "Breaking News Intelligence",
});

export function useUser() {
  return useContext(UserContext);
}

function buildDashboardTitle(markets: MarketInfo[]): string {
  if (markets.length === 0) return "Breaking News Intelligence";
  if (markets.length === 1) return `${markets[0].name} Breaking News`;
  if (markets.length === 2)
    return `${markets[0].name} & ${markets[1].name} News`;
  return `${markets[0].name} +${markets.length - 1} Markets`;
}

export function UserProvider({ children }: { children: ReactNode }) {
  // Defer auth check to client-side to avoid hydration mismatch
  // (localStorage is not available during SSR)
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, []);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: fetchUserProfile,
    enabled: loggedIn,
    staleTime: 5 * 60 * 1000, // 5 min
    refetchInterval: false,
    retry: 1,
  });

  const markets = profile?.markets ?? [];
  const preferences = profile?.preferences ?? null;
  const dashboardTitle = buildDashboardTitle(markets);

  return (
    <UserContext.Provider
      value={{
        profile: profile ?? null,
        isLoading,
        isLoggedIn: loggedIn,
        markets,
        preferences,
        dashboardTitle,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
