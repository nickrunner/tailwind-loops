import { BaseClient, type ClientConfig } from "./baseClient.js";
import type { ActivityType, ProfileListItem } from "./types.js";

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
}
