import { BaseClient, type ClientConfig } from "./baseClient.js";
import type { GenerateRouteRequest, GenerateRouteResponse } from "./types.js";

export class RouteClient {
  private client: BaseClient;

  constructor(config: ClientConfig) {
    this.client = new BaseClient("api/routes", config);
  }

  /** Generate loop routes from a starting point */
  public async generateRoutes(
    request: GenerateRouteRequest,
  ): Promise<GenerateRouteResponse> {
    return this.client.post<GenerateRouteResponse>({
      path: "generate",
      body: request,
    });
  }
}
