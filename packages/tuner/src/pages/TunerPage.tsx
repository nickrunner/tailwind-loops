import { useState, useEffect, useCallback } from "react";
import type {
  ActivityType,
  Route,
  CorridorNetworkGeoJson,
} from "@tailwind-loops/clients-react";
import {
  useScoringDefaults,
  useScoringProfile,
  useProfiles,
  useGenerateRoutes,
  useCorridorNetwork,
  useSaveConfig,
  useSaveAsProfile,
  useClearAllRegions,
  useRegionCache,
  useCacheHitZones,
} from "@tailwind-loops/clients-react";
import { useScoringParams } from "../hooks/useScoringParams.js";
import { TopBar } from "../components/organisms/TopBar.js";
import { Sidebar } from "../components/organisms/Sidebar.js";
import { TunerMap } from "../components/organisms/TunerMap.js";
import { RouteStatsPanel } from "../components/organisms/RouteStatsPanel.js";
import { Footer } from "../components/organisms/Footer.js";

const ALL_CORRIDOR_TYPES = [
  "trail", "path", "neighborhood", "rural-road", "collector", "arterial", "mixed",
] as const;

const HIDDEN_BY_DEFAULT: Record<string, Set<string>> = {
  "road-cycling": new Set(["trail", "path"]),
  "gravel-cycling": new Set(),
  "running": new Set(),
  "walking": new Set(),
};

function getDefaultVisibility(activity: string): Record<string, boolean> {
  const hidden = HIDDEN_BY_DEFAULT[activity] ?? new Set<string>();
  const vis: Record<string, boolean> = {};
  for (const t of ALL_CORRIDOR_TYPES) {
    vis[t] = !hidden.has(t);
  }
  return vis;
}

export function TunerPage() {
  // --- Activity + Profile ---
  const [activity, setActivity] = useState<ActivityType>("road-cycling");
  const [profileName, setProfileName] = useState("");

  // --- Scoring params (local state) ---
  const { params, setParam, readParams, loadFromServer } = useScoringParams();

  // --- Server hooks ---
  const defaults = useScoringDefaults(profileName ? undefined : activity);
  const profile = useScoringProfile(profileName || undefined);
  const profileList = useProfiles();
  const generateRoutes = useGenerateRoutes();
  const corridorNetworkMutation = useCorridorNetwork();
  const saveConfig = useSaveConfig();
  const saveAsProfile = useSaveAsProfile();
  const clearCache = useClearAllRegions();
  const regionCache = useRegionCache();

  // --- Map state ---
  const [startLatLng, setStartLatLng] = useState({ lat: 42.98656566989668, lng: -85.65484294159361 });
  const [showArrows, setShowArrows] = useState(false);
  const [showNetwork, setShowNetwork] = useState(true);
  const [showConnectors, setShowConnectors] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>(
    getDefaultVisibility("road-cycling"),
  );

  // --- Route state ---
  const [route, setRoute] = useState<Route | null>(null);
  const [corridorNetwork, setCorridorNetwork] = useState<CorridorNetworkGeoJson | null>(null);
  const [activeBucket, setActiveBucket] = useState<[number, number] | null>(null);
  const maxDistanceMeters = activeBucket ? activeBucket[1] * 1609.34 : undefined;
  const hitZones = useCacheHitZones(maxDistanceMeters);

  // --- Status ---
  const [status, setStatus] = useState("Loading...");
  const [footerMessage, setFooterMessage] = useState("Initializing...");

  // --- Load defaults when activity changes (and no profile) ---
  useEffect(() => {
    if (!profileName && defaults.data) {
      loadFromServer(defaults.data);
      setStatus("Ready");
    }
  }, [defaults.data, profileName, loadFromServer]);

  // --- Load profile when profile changes ---
  useEffect(() => {
    if (profileName && profile.data) {
      // If profile extends a different activity, update activity
      const profileData = profile.data;
      const extendsActivity = (profileData["_profile"] as Record<string, unknown> | undefined)?.["extends"] as string | undefined;
      if (extendsActivity) {
        setActivity(extendsActivity as ActivityType);
      }
      loadFromServer(profileData);
      setStatus("Ready");
    }
  }, [profile.data, profileName, loadFromServer]);

  // --- Activity change handler ---
  const handleActivityChange = useCallback((newActivity: ActivityType) => {
    setActivity(newActivity);
    setProfileName("");
    setVisibleTypes(getDefaultVisibility(newActivity));
  }, []);

  // --- Profile change handler ---
  const handleProfileChange = useCallback((name: string) => {
    setProfileName(name);
  }, []);

  // --- Param change handler ---
  const handleParamChange = useCallback(
    (path: string, value: number | string) => {
      setParam(path, value);
    },
    [setParam],
  );

  // --- Visibility change handler ---
  const handleVisibleTypesChange = useCallback((type: string, visible: boolean) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: visible }));
  }, []);

  // --- Select distance bucket (does not generate) ---
  const handleSelectBucket = useCallback((minMiles: number, maxMiles: number) => {
    setActiveBucket([minMiles, maxMiles]);
  }, []);

  // --- Generate route using selected bucket ---
  const handleGenerate = useCallback(() => {
    if (!activeBucket) return;
    const [minMiles, maxMiles] = activeBucket;
    const minMeters = Math.round(minMiles * 1609.34);
    const maxMeters = Math.round(maxMiles * 1609.34);
    setStatus(`Generating ${minMiles}-${maxMiles} mi route...`);

    // Determine which types to exclude based on visibility
    const excludeTypes = ALL_CORRIDOR_TYPES.filter((t) => visibleTypes[t] === false);

    // Fire route generation
    generateRoutes.mutate(
      {
        activityType: activity,
        startCoordinate: startLatLng,
        minDistanceMeters: minMeters,
        maxDistanceMeters: maxMeters,
        scoringParams: readParams() as never,
      },
      {
        onSuccess: (data) => {
          setRoute(data.route);
          const actualMi = data.route.stats.totalDistanceMeters
            ? (data.route.stats.totalDistanceMeters / 1609.34).toFixed(1)
            : "?";
          setFooterMessage(
            `Route: ${actualMi} mi (${minMiles}-${maxMiles} mi range) | ${data.meta.searchTimeMs}ms`,
          );
          setStatus("Ready");
          regionCache.refetch();
          hitZones.refetch();
        },
        onError: (err) => {
          setFooterMessage(`Route error: ${err instanceof Error ? err.message : String(err)}`);
          setStatus("Error");
        },
      },
    );

    // Fire corridor network fetch in parallel
    corridorNetworkMutation.mutate(
      {
        activityType: activity,
        startCoordinate: startLatLng,
        maxDistanceMeters: maxMeters,
        scoringParams: readParams() as never,
        excludeTypes,
        includeConnectors: showConnectors,
      },
      {
        onSuccess: (data) => {
          setCorridorNetwork(data);
          setFooterMessage((prev) => `${prev} | ${data._meta.corridorCount} corridors`);
        },
      },
    );
  }, [activeBucket, activity, startLatLng, readParams, generateRoutes, corridorNetworkMutation, regionCache, hitZones, visibleTypes, showConnectors]);

  const cacheHitZones = hitZones.data?.zones ?? [];

  // --- Reset ---
  const handleReset = useCallback(() => {
    setProfileName("");
    defaults.refetch();
  }, [defaults]);

  // --- Save ---
  const handleSave = useCallback(() => {
    saveConfig.mutate(
      {
        activityType: activity,
        params: readParams(),
        profileName: profileName || undefined,
        asBase: !profileName,
      },
      {
        onSuccess: () => {
          const target = profileName ? `profile "${profileName}"` : `${activity} base config`;
          setFooterMessage(`Saved ${target}`);
        },
        onError: (err) => {
          setFooterMessage(`Save error: ${err instanceof Error ? err.message : String(err)}`);
        },
      },
    );
  }, [activity, profileName, readParams, saveConfig]);

  // --- Save As ---
  const handleSaveAs = useCallback(() => {
    const name = prompt("Profile name (e.g. \"weekend-warrior\"):");
    if (!name) return;
    const description = prompt("Short description (optional):") ?? "";

    saveAsProfile.mutate(
      {
        name,
        description,
        activityType: activity,
        params: readParams(),
      },
      {
        onSuccess: () => {
          setFooterMessage(`Saved new profile "${name}"`);
          setProfileName(name);
          profileList.refetch();
        },
        onError: (err) => {
          setFooterMessage(`Save error: ${err instanceof Error ? err.message : String(err)}`);
        },
      },
    );
  }, [activity, readParams, saveAsProfile, profileList]);

  // --- Clear Cache ---
  const handleClearCache = useCallback(() => {
    clearCache.mutate(undefined as never, {
      onSuccess: (data) => {
        const cleared = (data as { cleared?: number })?.cleared ?? 0;
        setFooterMessage(`Cleared ${cleared} cached network file(s)`);
      },
      onError: (err) => {
        setFooterMessage(`Cache error: ${err instanceof Error ? err.message : String(err)}`);
      },
    });
  }, [clearCache]);

  return (
    <>
      <TopBar
        activity={activity}
        onActivityChange={handleActivityChange}
        profileName={profileName}
        profiles={profileList.data ?? []}
        onProfileChange={handleProfileChange}
        showArrows={showArrows}
        onToggleArrows={() => setShowArrows((p) => !p)}
        status={status}
      />
      <div className="main">
        <Sidebar
          params={params}
          onParamChange={handleParamChange}
          visibleTypes={visibleTypes}
          onVisibleTypesChange={handleVisibleTypesChange}
          showNetwork={showNetwork}
          onShowNetworkChange={setShowNetwork}
          showConnectors={showConnectors}
          onShowConnectorsChange={setShowConnectors}
          activeBucket={activeBucket}
          isGenerating={generateRoutes.isPending}
          onSelectBucket={handleSelectBucket}
          onGenerate={handleGenerate}
          onReset={handleReset}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onClearCache={handleClearCache}
        />
        <TunerMap
          startLatLng={startLatLng}
          onStartChange={setStartLatLng}
          route={route}
          corridorNetwork={corridorNetwork}
          visibleTypes={visibleTypes}
          showArrows={showArrows}
          showNetwork={showNetwork}
          showConnectors={showConnectors}
          cacheHitZones={cacheHitZones}
        />
        {route && <RouteStatsPanel route={route} onClose={() => setRoute(null)} />}
      </div>
      <Footer message={footerMessage} />
    </>
  );
}
