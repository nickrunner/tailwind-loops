import { createContext, useContext } from "react";
import type { ClientConfig } from "@tailwind-loops/clients-core";

export interface TwlContextValue {
  /** Base configuration for API clients */
  config: ClientConfig;
}

export const TwlContext = createContext<TwlContextValue | undefined>(undefined);

export function useTwlContext(): TwlContextValue {
  const ctx = useContext(TwlContext);
  if (!ctx) {
    throw new Error("useTwlContext must be used within a TwlProvider");
  }
  return ctx;
}
