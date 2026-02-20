import { Body, Controller, Get, Post, Query, Route, Tags } from "@tsoa/runtime";
import {
  loadBaseConfig,
  loadProfileConfig,
  listProfiles,
  saveBaseConfig,
  saveProfileConfig,
  type ScoringParams,
} from "@tailwind-loops/routing";
import type { ActivityType } from "@tailwind-loops/types";
import type { ProfileListItem, SaveConfigResponse, SaveAsProfileResponse } from "../models/responses.js";
import type { SaveConfigRequest, SaveAsProfileRequest } from "../models/requests.js";

@Route("api/config")
@Tags("Config")
export class ConfigController extends Controller {
  /** Load scoring defaults for an activity type, or a named profile */
  @Get("defaults")
  public async getDefaults(
    @Query() activity?: string,
    @Query() profile?: string,
  ): Promise<ScoringParams> {
    if (profile) {
      try {
        return loadProfileConfig(profile);
      } catch (err) {
        this.setStatus(404);
        throw err;
      }
    }

    const activityType = (activity ?? "road-cycling") as ActivityType;
    return loadBaseConfig(activityType);
  }

  /** List all available scoring profiles */
  @Get("profiles")
  public async getProfiles(): Promise<ProfileListItem[]> {
    return listProfiles();
  }

  /** Save scoring config (base or profile) */
  @Post("save")
  public async saveConfig(
    @Body() body: SaveConfigRequest,
  ): Promise<SaveConfigResponse> {
    const activityType = body.activityType as ActivityType;

    if (body.profileName && !body.asBase) {
      saveProfileConfig(body.profileName, body.params, activityType, "");
      return { saved: true, activityType: body.activityType, profileName: body.profileName };
    } else {
      saveBaseConfig(activityType, body.params);
      return { saved: true, activityType: body.activityType };
    }
  }

  /** Save as a new named profile */
  @Post("save-as")
  public async saveAsProfile(
    @Body() body: SaveAsProfileRequest,
  ): Promise<SaveAsProfileResponse> {
    if (!body.name) {
      this.setStatus(400);
      throw new Error("Profile name is required");
    }

    const activityType = body.activityType as ActivityType;
    saveProfileConfig(body.name, body.params, activityType, body.description);
    return { saved: true, name: body.name, activityType: body.activityType };
  }
}
