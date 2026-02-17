/**
 * Geofabrik region definitions for downloading OSM PBF extracts.
 *
 * Geofabrik provides free, regularly updated PBF extracts of OSM data
 * organized by geographic region.
 */

/** A Geofabrik region with its download URL */
export interface GeofabrikRegion {
  /** Human-readable name */
  name: string;
  /** Geofabrik download URL for the latest PBF */
  url: string;
}

const GEOFABRIK_BASE = "https://download.geofabrik.de";

/** All 50 US states + DC as Geofabrik regions */
export const US_STATES: Record<string, GeofabrikRegion> = {
  alabama: { name: "Alabama", url: `${GEOFABRIK_BASE}/north-america/us/alabama-latest.osm.pbf` },
  alaska: { name: "Alaska", url: `${GEOFABRIK_BASE}/north-america/us/alaska-latest.osm.pbf` },
  arizona: { name: "Arizona", url: `${GEOFABRIK_BASE}/north-america/us/arizona-latest.osm.pbf` },
  arkansas: { name: "Arkansas", url: `${GEOFABRIK_BASE}/north-america/us/arkansas-latest.osm.pbf` },
  california: { name: "California", url: `${GEOFABRIK_BASE}/north-america/us/california-latest.osm.pbf` },
  colorado: { name: "Colorado", url: `${GEOFABRIK_BASE}/north-america/us/colorado-latest.osm.pbf` },
  connecticut: { name: "Connecticut", url: `${GEOFABRIK_BASE}/north-america/us/connecticut-latest.osm.pbf` },
  delaware: { name: "Delaware", url: `${GEOFABRIK_BASE}/north-america/us/delaware-latest.osm.pbf` },
  "district-of-columbia": { name: "District of Columbia", url: `${GEOFABRIK_BASE}/north-america/us/district-of-columbia-latest.osm.pbf` },
  florida: { name: "Florida", url: `${GEOFABRIK_BASE}/north-america/us/florida-latest.osm.pbf` },
  georgia: { name: "Georgia", url: `${GEOFABRIK_BASE}/north-america/us/georgia-latest.osm.pbf` },
  hawaii: { name: "Hawaii", url: `${GEOFABRIK_BASE}/north-america/us/hawaii-latest.osm.pbf` },
  idaho: { name: "Idaho", url: `${GEOFABRIK_BASE}/north-america/us/idaho-latest.osm.pbf` },
  illinois: { name: "Illinois", url: `${GEOFABRIK_BASE}/north-america/us/illinois-latest.osm.pbf` },
  indiana: { name: "Indiana", url: `${GEOFABRIK_BASE}/north-america/us/indiana-latest.osm.pbf` },
  iowa: { name: "Iowa", url: `${GEOFABRIK_BASE}/north-america/us/iowa-latest.osm.pbf` },
  kansas: { name: "Kansas", url: `${GEOFABRIK_BASE}/north-america/us/kansas-latest.osm.pbf` },
  kentucky: { name: "Kentucky", url: `${GEOFABRIK_BASE}/north-america/us/kentucky-latest.osm.pbf` },
  louisiana: { name: "Louisiana", url: `${GEOFABRIK_BASE}/north-america/us/louisiana-latest.osm.pbf` },
  maine: { name: "Maine", url: `${GEOFABRIK_BASE}/north-america/us/maine-latest.osm.pbf` },
  maryland: { name: "Maryland", url: `${GEOFABRIK_BASE}/north-america/us/maryland-latest.osm.pbf` },
  massachusetts: { name: "Massachusetts", url: `${GEOFABRIK_BASE}/north-america/us/massachusetts-latest.osm.pbf` },
  michigan: { name: "Michigan", url: `${GEOFABRIK_BASE}/north-america/us/michigan-latest.osm.pbf` },
  minnesota: { name: "Minnesota", url: `${GEOFABRIK_BASE}/north-america/us/minnesota-latest.osm.pbf` },
  mississippi: { name: "Mississippi", url: `${GEOFABRIK_BASE}/north-america/us/mississippi-latest.osm.pbf` },
  missouri: { name: "Missouri", url: `${GEOFABRIK_BASE}/north-america/us/missouri-latest.osm.pbf` },
  montana: { name: "Montana", url: `${GEOFABRIK_BASE}/north-america/us/montana-latest.osm.pbf` },
  nebraska: { name: "Nebraska", url: `${GEOFABRIK_BASE}/north-america/us/nebraska-latest.osm.pbf` },
  nevada: { name: "Nevada", url: `${GEOFABRIK_BASE}/north-america/us/nevada-latest.osm.pbf` },
  "new-hampshire": { name: "New Hampshire", url: `${GEOFABRIK_BASE}/north-america/us/new-hampshire-latest.osm.pbf` },
  "new-jersey": { name: "New Jersey", url: `${GEOFABRIK_BASE}/north-america/us/new-jersey-latest.osm.pbf` },
  "new-mexico": { name: "New Mexico", url: `${GEOFABRIK_BASE}/north-america/us/new-mexico-latest.osm.pbf` },
  "new-york": { name: "New York", url: `${GEOFABRIK_BASE}/north-america/us/new-york-latest.osm.pbf` },
  "north-carolina": { name: "North Carolina", url: `${GEOFABRIK_BASE}/north-america/us/north-carolina-latest.osm.pbf` },
  "north-dakota": { name: "North Dakota", url: `${GEOFABRIK_BASE}/north-america/us/north-dakota-latest.osm.pbf` },
  ohio: { name: "Ohio", url: `${GEOFABRIK_BASE}/north-america/us/ohio-latest.osm.pbf` },
  oklahoma: { name: "Oklahoma", url: `${GEOFABRIK_BASE}/north-america/us/oklahoma-latest.osm.pbf` },
  oregon: { name: "Oregon", url: `${GEOFABRIK_BASE}/north-america/us/oregon-latest.osm.pbf` },
  pennsylvania: { name: "Pennsylvania", url: `${GEOFABRIK_BASE}/north-america/us/pennsylvania-latest.osm.pbf` },
  "rhode-island": { name: "Rhode Island", url: `${GEOFABRIK_BASE}/north-america/us/rhode-island-latest.osm.pbf` },
  "south-carolina": { name: "South Carolina", url: `${GEOFABRIK_BASE}/north-america/us/south-carolina-latest.osm.pbf` },
  "south-dakota": { name: "South Dakota", url: `${GEOFABRIK_BASE}/north-america/us/south-dakota-latest.osm.pbf` },
  tennessee: { name: "Tennessee", url: `${GEOFABRIK_BASE}/north-america/us/tennessee-latest.osm.pbf` },
  texas: { name: "Texas", url: `${GEOFABRIK_BASE}/north-america/us/texas-latest.osm.pbf` },
  utah: { name: "Utah", url: `${GEOFABRIK_BASE}/north-america/us/utah-latest.osm.pbf` },
  vermont: { name: "Vermont", url: `${GEOFABRIK_BASE}/north-america/us/vermont-latest.osm.pbf` },
  virginia: { name: "Virginia", url: `${GEOFABRIK_BASE}/north-america/us/virginia-latest.osm.pbf` },
  washington: { name: "Washington", url: `${GEOFABRIK_BASE}/north-america/us/washington-latest.osm.pbf` },
  "west-virginia": { name: "West Virginia", url: `${GEOFABRIK_BASE}/north-america/us/west-virginia-latest.osm.pbf` },
  wisconsin: { name: "Wisconsin", url: `${GEOFABRIK_BASE}/north-america/us/wisconsin-latest.osm.pbf` },
  wyoming: { name: "Wyoming", url: `${GEOFABRIK_BASE}/north-america/us/wyoming-latest.osm.pbf` },
};

/**
 * Get the download URL for a Geofabrik region.
 *
 * @param regionKey - Key from US_STATES (e.g. "michigan")
 * @returns The download URL
 * @throws If the region key is not found
 */
export function getRegionUrl(regionKey: string): string {
  const region = US_STATES[regionKey];
  if (!region) {
    throw new Error(`Unknown region: "${regionKey}". Available: ${Object.keys(US_STATES).join(", ")}`);
  }
  return region.url;
}

/**
 * Resolve a region key to a GeofabrikRegion.
 *
 * @param regionKey - Key from US_STATES (e.g. "michigan")
 * @returns The GeofabrikRegion
 * @throws If the region key is not found
 */
export function resolveRegion(regionKey: string): GeofabrikRegion {
  const region = US_STATES[regionKey];
  if (!region) {
    throw new Error(`Unknown region: "${regionKey}". Available: ${Object.keys(US_STATES).join(", ")}`);
  }
  return region;
}
