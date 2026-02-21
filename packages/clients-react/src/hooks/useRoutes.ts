import type {
  GenerateRouteRequest,
  GenerateRouteResponse,
} from "@tailwind-loops/clients-core";
import { useRouteClient } from "./useClients.js";
import { useDataMutation } from "../utils/query.utils.js";

const ROUTE_KEYS = ["routes"];

/**
 * Mutation hook for generating routes.
 *
 * Usage:
 *   const generateRoutes = useGenerateRoutes();
 *   generateRoutes.mutate({ activityType: "road-cycling", ... });
 *   // generateRoutes.data — the route response
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
