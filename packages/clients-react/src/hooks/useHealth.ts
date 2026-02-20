import type { HealthResponse } from "@tailwind-loops/clients-core";
import { useHealthClient } from "./useClients.js";
import { useRemote, type Remote } from "../utils/query.utils.js";

/** Fetch server health status */
export function useHealth(): Remote<HealthResponse> {
  const client = useHealthClient();

  return useRemote<HealthResponse>(
    async () => client.getHealth(),
    { keys: ["health"] },
  );
}
