import { Controller, Delete, Get, Path, Route, Tags } from "@tsoa/runtime";
import type {
  CacheListResponse,
  CacheClearResponse,
} from "../models/responses.js";
import { NetworkCacheService } from "../services/network-cache.service.js";

@Route("api/regions/cache")
@Tags("Regions")
export class RegionController extends Controller {
  /** List all cached regions */
  @Get()
  public async listCache(): Promise<CacheListResponse> {
    const cache = new NetworkCacheService();
    return { entries: cache.listEntries() };
  }

  /** Clear all cached regions */
  @Delete()
  public async clearAllCache(): Promise<CacheClearResponse> {
    const cache = new NetworkCacheService();
    return { cleared: cache.clearAll() };
  }

  /** Clear a specific cached region by ID */
  @Delete("{id}")
  public async clearCacheEntry(
    @Path() id: string,
  ): Promise<CacheClearResponse> {
    const cache = new NetworkCacheService();
    const removed = cache.clearEntry(id);
    if (!removed) {
      this.setStatus(404);
    }
    return { cleared: removed ? 1 : 0 };
  }
}
