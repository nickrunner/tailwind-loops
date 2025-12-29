/**
 * Surface data providers for graph enrichment.
 *
 * Each provider implements the SurfaceDataProvider interface and
 * fetches surface observations from a specific data source.
 */

export { GravelmapProvider, type GravelmapConfig } from "./gravelmap.js";

// Future providers:
// export { StravaHeatmapProvider } from "./strava.js";
// export { SatelliteMLProvider } from "./satellite.js";
