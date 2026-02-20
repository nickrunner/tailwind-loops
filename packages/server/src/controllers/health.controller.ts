import { Controller, Get, Route, Tags } from "@tsoa/runtime";
import type { HealthResponse } from "../models/responses.js";
import { NetworkCacheService } from "../services/network-cache.service.js";

@Route("health")
@Tags("Health")
export class HealthController extends Controller {
  /** Health check with cache statistics */
  @Get()
  public async getHealth(): Promise<HealthResponse> {
    const cache = new NetworkCacheService();
    return {
      status: "ok",
      uptime: process.uptime(),
      cache: cache.getStats(),
    };
  }
}
