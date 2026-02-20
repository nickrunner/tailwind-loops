import type {
  ActivityType,
  ProfileListItem,
} from "@tailwind-loops/clients-core";
import { useConfigClient } from "./useClients.js";
import { useRemote, type Remote } from "../utils/query.utils.js";

/** Fetch scoring defaults for an activity type */
export function useScoringDefaults(
  activity?: ActivityType,
): Remote<Record<string, unknown>> {
  const client = useConfigClient();

  return useRemote<Record<string, unknown>>(
    async () => client.getDefaults(activity),
    { keys: ["config", "defaults"], params: { activity } },
  );
}

/** Fetch scoring config for a named profile */
export function useScoringProfile(
  profileName: string,
): Remote<Record<string, unknown>> {
  const client = useConfigClient();

  return useRemote<Record<string, unknown>>(
    async () => client.getProfile(profileName),
    { keys: ["config", "profile"], params: { profileName } },
  );
}

/** List all available scoring profiles */
export function useProfiles(): Remote<ProfileListItem[]> {
  const client = useConfigClient();

  return useRemote<ProfileListItem[]>(
    async () => client.listProfiles(),
    { keys: ["config", "profiles"] },
  );
}
