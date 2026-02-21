import { Body, Controller, Post, Route, Tags, SuccessResponse } from "@tsoa/runtime";
import type { CorridorNetworkRequest } from "../models/requests.js";
import type { CorridorNetworkResponse } from "../models/responses.js";
import { CorridorNetworkService } from "../services/corridor-network.service.js";

@Route("api/corridors")
@Tags("Corridors")
export class CorridorController extends Controller {
  /** Get the scored corridor network as GeoJSON */
  @Post("network")
  @SuccessResponse(200, "Corridor network retrieved successfully")
  public async getNetwork(
    @Body() body: CorridorNetworkRequest,
  ): Promise<CorridorNetworkResponse> {
    const service = new CorridorNetworkService();
    return service.getNetwork(body);
  }
}
