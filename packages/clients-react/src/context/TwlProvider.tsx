import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClientConfig } from "@tailwind-loops/clients-core";
import { TwlContext, type TwlContextValue } from "./TwlContext.js";

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

export interface TwlProviderProps {
  config: ClientConfig;
  queryClient?: QueryClient;
  children: React.ReactNode;
}

export function TwlProvider({
  config,
  queryClient,
  children,
}: TwlProviderProps): React.ReactElement {
  const contextValue: TwlContextValue = { config };
  const qc = queryClient ?? defaultQueryClient;

  return (
    <TwlContext.Provider value={contextValue}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </TwlContext.Provider>
  );
}
