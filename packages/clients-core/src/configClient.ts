import { BaseClient, type ClientConfig } from "./baseClient.js";
import type {
  ActivityType,
  ProfileListItem,
  SaveConfigRequest,
  SaveConfigResponse,
  SaveAsProfileRequest,
  SaveAsProfileResponse,
} from "./types.js";

export class ConfigClient {
  private client: BaseClient;

  constructor(config: ClientConfig) {
    this.client = new BaseClient("api/config", config);
  }

  /** Load scoring defaults for an activity type */
  public async getDefaults(
    activity?: ActivityType,
  ): Promise<Record<string, unknown>> {
    return this.client.get<Record<string, unknown>>({
      path: "defaults",
      query: activity ? { activity } : undefined,
    });
  }

  /** Load scoring config for a named profile */
  public async getProfile(
    profileName: string,
  ): Promise<Record<string, unknown>> {
    return this.client.get<Record<string, unknown>>({
      path: "defaults",
      query: { profile: profileName },
    });
  }

  /** List all available scoring profiles */
  public async listProfiles(): Promise<ProfileListItem[]> {
    return this.client.get<ProfileListItem[]>({ path: "profiles" });
  }

  /** Save scoring config (base or profile) */
  public async saveConfig(
    request: SaveConfigRequest,
  ): Promise<SaveConfigResponse> {
    return this.client.post<SaveConfigResponse>({
      path: "save",
      body: request,
    });
  }

  /** Save as a new named profile */
  public async saveAsProfile(
    request: SaveAsProfileRequest,
  ): Promise<SaveAsProfileResponse> {
    return this.client.post<SaveAsProfileResponse>({
      path: "save-as",
      body: request,
    });
  }
}
