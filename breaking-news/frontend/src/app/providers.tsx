"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { UserProvider } from "@/components/UserProvider";
import { SidebarProvider } from "@/components/SidebarProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15 * 1000,
            refetchInterval: 30 * 1000,
            retry: 2,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <SidebarProvider>{children}</SidebarProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}
