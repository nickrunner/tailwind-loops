import type {
  GenerateRouteRequest,
  GenerateRouteResponse,
  CacheClearResponse,
} from "@tailwind-loops/clients-core";
import { useRouteClient } from "./useClients.js";
import { useDataMutation, useQueryInvalidation } from "../utils/query.utils.js";

const ROUTE_KEYS = ["routes"];

/**
 * Mutation hook for generating routes.
 *
 * Usage:
 *   const generateRoutes = useGenerateRoutes();
 *   generateRoutes.mutate({ activityType: "road-cycling", ... });
 *   // generateRoutes.data — the GeoJSON response
 *   // generateRoutes.isPending — loading state
 */
export function useGenerateRoutes() {
  const client = useRouteClient();

  return useDataMutation<
    GenerateRouteResponse,
    GenerateRouteRequest,
    GenerateRouteResponse
  >({
    queryKey: ROUTE_KEYS,
    mutationFn: async (request) => client.generateRoutes(request),
  });
}
