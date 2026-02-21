import type {
  CorridorNetworkRequest,
  CorridorNetworkGeoJson,
} from "@tailwind-loops/clients-core";
import { useCorridorClient } from "./useClients.js";
import { useDataMutation } from "../utils/query.utils.js";

const CORRIDOR_KEYS = ["corridors"];

/**
 * Mutation hook for fetching the corridor network.
 *
 * Usage:
 *   const corridorNetwork = useCorridorNetwork();
 *   corridorNetwork.mutate({ activityType: "road-cycling", ... });
 *   // corridorNetwork.data — the GeoJSON response
 *   // corridorNetwork.isPending — loading state
 */
export function useCorridorNetwork() {
  const client = useCorridorClient();

  return useDataMutation<
    CorridorNetworkGeoJson,
    CorridorNetworkRequest,
    CorridorNetworkGeoJson
  >({
    queryKey: CORRIDOR_KEYS,
    mutationFn: async (request) => client.getNetwork(request),
  });
}
