import { BaseClient, type ClientConfig } from "./baseClient.js";
import type { HealthResponse } from "./types.js";

export class HealthClient {
  private client: BaseClient;

  constructor(config: ClientConfig) {
    this.client = new BaseClient("health", config);
  }

  /** Health check with cache statistics */
  public async getHealth(): Promise<HealthResponse> {
    return this.client.get<HealthResponse>();
  }
}
