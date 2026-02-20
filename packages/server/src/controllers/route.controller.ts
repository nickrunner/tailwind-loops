import { Body, Controller, Post, Route, Tags, SuccessResponse } from "@tsoa/runtime";
import type { GenerateRouteRequest } from "../models/requests.js";
import {
  RouteGenerationService,
  RouteNotFoundError,
} from "../services/route-generation.service.js";

@Route("api/routes")
@Tags("Routes")
export class RouteController extends Controller {
  /** Generate loop routes from a starting point */
  @Post("generate")
  @SuccessResponse(200, "Routes generated successfully")
  public async generateRoutes(
    @Body() body: GenerateRouteRequest,
  ): Promise<unknown> {
    const service = new RouteGenerationService();
    try {
      return await service.generate(body);
    } catch (err) {
      if (err instanceof RouteNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }
}
