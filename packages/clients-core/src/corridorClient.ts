import { BaseClient, type ClientConfig } from "./baseClient.js";
import type { CorridorNetworkRequest, CorridorNetworkGeoJson } from "./types.js";

export class CorridorClient {
  private client: BaseClient;

  constructor(config: ClientConfig) {
    this.client = new BaseClient("api/corridors", config);
  }

  /** Get the scored corridor network as GeoJSON */
  public async getNetwork(
    request: CorridorNetworkRequest,
  ): Promise<CorridorNetworkGeoJson> {
    return this.client.post<CorridorNetworkGeoJson>({
      path: "network",
      body: request,
    });
  }
}
