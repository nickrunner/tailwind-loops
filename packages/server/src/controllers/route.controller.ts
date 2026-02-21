import { Body, Controller, Post, Route, Tags, SuccessResponse } from "@tsoa/runtime";
import type { GenerateRouteRequest } from "../models/requests.js";
import type { GenerateRouteResponse } from "../models/responses.js";
import {
  RouteGenerationService,
  RouteNotFoundError,
} from "../services/route-generation.service.js";

@Route("api/routes")
@Tags("Routes")
export class RouteController extends Controller {
  /** Generate loop routes from a starting point */
  @Post("generate")
  @SuccessResponse(200, "Route generated successfully")
  public async generateRoutes(
    @Body() body: GenerateRouteRequest,
  ): Promise<GenerateRouteResponse> {
    const service = new RouteGenerationService();
    try {
      return await service.generate(body);
    } catch (err) {
      if (err instanceof RouteNotFoundError) {
        this.setStatus(404);
        return { message: err.message } as unknown as GenerateRouteResponse;
      }
      throw err;
    }
  }
}
