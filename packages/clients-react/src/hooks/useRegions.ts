import type {
  CacheListResponse,
  CacheClearResponse,
  CacheHitZonesResponse,
} from "@tailwind-loops/clients-core";
import { useRegionClient } from "./useClients.js";
import {
  useRemote,
  useDataMutation,
  useQueryInvalidation,
  type Remote,
} from "../utils/query.utils.js";

const REGION_KEYS = ["regions", "cache"];

/** Fetch the list of cached regions */
export function useRegionCache(): Remote<CacheListResponse> {
  const client = useRegionClient();

  return useRemote<CacheListResponse>(
    async () => client.listCache(),
    { keys: REGION_KEYS },
  );
}

/** Fetch cache hit zones for a given max route distance */
export function useCacheHitZones(maxDistanceMeters?: number): Remote<CacheHitZonesResponse> {
  const client = useRegionClient();

  return useRemote<CacheHitZonesResponse>(
    async () => client.listHitZones(maxDistanceMeters!),
    { keys: [...REGION_KEYS, "hit-zones"], params: { maxDistanceMeters } },
    { enabled: maxDistanceMeters !== undefined },
  );
}

/** Mutation to clear all cached regions */
export function useClearAllRegions() {
  const client = useRegionClient();
  const invalidate = useQueryInvalidation(REGION_KEYS);

  return useDataMutation<CacheClearResponse, void, CacheListResponse>({
    queryKey: REGION_KEYS,
    mutationFn: async () => client.clearAllCache(),
    onSuccess: () => invalidate(),
  });
}

/** Mutation to clear a specific cached region */
export function useClearRegion() {
  const client = useRegionClient();
  const invalidate = useQueryInvalidation(REGION_KEYS);

  return useDataMutation<CacheClearResponse, string, CacheListResponse>({
    queryKey: REGION_KEYS,
    mutationFn: async (id) => client.clearCacheEntry(id),
    onSuccess: () => invalidate(),
  });
}
