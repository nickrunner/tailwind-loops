import { BaseClient, type ClientConfig } from "./baseClient.js";
import type { CacheClearResponse, CacheListResponse } from "./types.js";

export class RegionClient {
  private client: BaseClient;

  constructor(config: ClientConfig) {
    this.client = new BaseClient("api/regions/cache", config);
  }

  /** List all cached regions */
  public async listCache(): Promise<CacheListResponse> {
    return this.client.get<CacheListResponse>();
  }

  /** Clear all cached regions */
  public async clearAllCache(): Promise<CacheClearResponse> {
    return this.client.delete<CacheClearResponse>();
  }

  /** Clear a specific cached region by ID */
  public async clearCacheEntry(id: string): Promise<CacheClearResponse> {
    return this.client.delete<CacheClearResponse>({ path: id });
  }
}
