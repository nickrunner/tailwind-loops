import { Controller, Get, Query, Route, Tags } from "@tsoa/runtime";
import {
  loadBaseConfig,
  loadProfileConfig,
  listProfiles,
  type ScoringParams,
} from "@tailwind-loops/routing";
import type { ActivityType } from "@tailwind-loops/types";
import type { ProfileListItem } from "../models/responses.js";

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
}
