import type {
  ActivityType,
  ProfileListItem,
  SaveConfigRequest,
  SaveConfigResponse,
  SaveAsProfileRequest,
  SaveAsProfileResponse,
} from "@tailwind-loops/clients-core";
import { useConfigClient } from "./useClients.js";
import { useRemote, useDataMutation, type Remote } from "../utils/query.utils.js";

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
  profileName: string | undefined,
): Remote<Record<string, unknown>> {
  const client = useConfigClient();

  return useRemote<Record<string, unknown>>(
    async () => client.getProfile(profileName!),
    { keys: ["config", "profile"], params: { profileName } },
    { enabled: !!profileName },
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

/** Mutation hook for saving scoring config (base or profile) */
export function useSaveConfig() {
  const client = useConfigClient();

  return useDataMutation<SaveConfigResponse, SaveConfigRequest, SaveConfigResponse>({
    queryKey: ["config"],
    mutationFn: async (request) => client.saveConfig(request),
  });
}

/** Mutation hook for saving as a new profile */
export function useSaveAsProfile() {
  const client = useConfigClient();

  return useDataMutation<SaveAsProfileResponse, SaveAsProfileRequest, SaveAsProfileResponse>({
    queryKey: ["config"],
    mutationFn: async (request) => client.saveAsProfile(request),
  });
}
