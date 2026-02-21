import { useMemo } from "react";
import {
  RouteClient,
  CorridorClient,
  RegionClient,
  ConfigClient,
  HealthClient,
} from "@tailwind-loops/clients-core";
import { useTwlContext } from "../context/TwlContext.js";

export function useRouteClient(): RouteClient {
  const { config } = useTwlContext();
  return useMemo(() => new RouteClient(config), [config]);
}

export function useCorridorClient(): CorridorClient {
  const { config } = useTwlContext();
  return useMemo(() => new CorridorClient(config), [config]);
}

export function useRegionClient(): RegionClient {
  const { config } = useTwlContext();
  return useMemo(() => new RegionClient(config), [config]);
}

export function useConfigClient(): ConfigClient {
  const { config } = useTwlContext();
  return useMemo(() => new ConfigClient(config), [config]);
}

export function useHealthClient(): HealthClient {
  const { config } = useTwlContext();
  return useMemo(() => new HealthClient(config), [config]);
}
