import { describe, it, expect } from "vitest";
import {
  extractRoadClass,
  extractSurface,
  extractInfrastructure,
  extractOneWay,
  isReverseOneWay,
  extractSpeedLimit,
  extractLanes,
  extractName,
} from "./tag-extractors.js";

describe("extractRoadClass", () => {
  it("maps highway=cycleway to cycleway", () => {
    expect(extractRoadClass({ highway: "cycleway" })).toBe("cycleway");
  });

  it("maps highway=residential to residential", () => {
    expect(extractRoadClass({ highway: "residential" })).toBe("residential");
  });

  it("maps highway=living_street to residential", () => {
    expect(extractRoadClass({ highway: "living_street" })).toBe("residential");
  });

  it("maps highway=path to path", () => {
    expect(extractRoadClass({ highway: "path" })).toBe("path");
  });

  it("maps highway=track to track", () => {
    expect(extractRoadClass({ highway: "track" })).toBe("track");
  });

  it("maps highway link types to their parent class", () => {
    expect(extractRoadClass({ highway: "primary_link" })).toBe("primary");
    expect(extractRoadClass({ highway: "secondary_link" })).toBe("secondary");
    expect(extractRoadClass({ highway: "tertiary_link" })).toBe("tertiary");
  });

  it("returns unclassified for unknown highway types", () => {
    expect(extractRoadClass({ highway: "proposed" })).toBe("unclassified");
    expect(extractRoadClass({ highway: "motorway" })).toBe("unclassified");
  });

  it("returns unclassified for undefined tags", () => {
    expect(extractRoadClass(undefined)).toBe("unclassified");
  });

  it("returns unclassified for empty tags", () => {
    expect(extractRoadClass({})).toBe("unclassified");
  });
});

describe("extractSurface", () => {
  it("returns high confidence for explicit asphalt tag", () => {
    const obs = extractSurface({ surface: "asphalt" });
    expect(obs.surface).toBe("paved");
    expect(obs.source).toBe("osm-surface-tag");
    expect(obs.sourceConfidence).toBe(0.8);
  });

  it("returns high confidence for explicit gravel tag", () => {
    const obs = extractSurface({ surface: "gravel" });
    expect(obs.surface).toBe("unpaved");
    expect(obs.source).toBe("osm-surface-tag");
    expect(obs.sourceConfidence).toBe(0.8);
  });

  it("maps fine_gravel to unpaved", () => {
    const obs = extractSurface({ surface: "fine_gravel" });
    expect(obs.surface).toBe("unpaved");
  });

  it("maps compacted to unpaved", () => {
    const obs = extractSurface({ surface: "compacted" });
    expect(obs.surface).toBe("unpaved");
  });

  it("maps dirt to unpaved", () => {
    const obs = extractSurface({ surface: "dirt" });
    expect(obs.surface).toBe("unpaved");
  });

  it("maps earth to unpaved", () => {
    const obs = extractSurface({ surface: "earth" });
    expect(obs.surface).toBe("unpaved");
  });

  it("returns low confidence for highway inference", () => {
    const obs = extractSurface({ highway: "track" });
    expect(obs.surface).toBe("unpaved");
    expect(obs.source).toBe("osm-highway-inferred");
    expect(obs.sourceConfidence).toBe(0.3);
  });

  it("infers paved for residential roads", () => {
    const obs = extractSurface({ highway: "residential" });
    expect(obs.surface).toBe("paved");
    expect(obs.source).toBe("osm-highway-inferred");
  });

  it("infers unknown for path without surface tag", () => {
    const obs = extractSurface({ highway: "path" });
    expect(obs.surface).toBe("unknown");
  });

  it("prefers explicit surface tag over highway inference", () => {
    const obs = extractSurface({ highway: "residential", surface: "gravel" });
    expect(obs.surface).toBe("unpaved");
    expect(obs.source).toBe("osm-surface-tag");
  });

  it("uses provided roadClass for inference", () => {
    const obs = extractSurface({}, "track");
    expect(obs.surface).toBe("unpaved");
  });
});

describe("extractInfrastructure", () => {
  it("returns all false for undefined tags", () => {
    const infra = extractInfrastructure(undefined);
    expect(infra.hasBicycleInfra).toBe(false);
    expect(infra.hasPedestrianPath).toBe(false);
    expect(infra.hasShoulder).toBe(false);
    expect(infra.isSeparated).toBe(false);
  });

  it("detects cycleway lane as dedicated path", () => {
    const infra = extractInfrastructure({ cycleway: "lane" });
    expect(infra.hasBicycleInfra).toBe(true);
  });

  it("detects cycleway track as dedicated and separated", () => {
    const infra = extractInfrastructure({ cycleway: "track" });
    expect(infra.hasBicycleInfra).toBe(true);
    expect(infra.isSeparated).toBe(true);
  });

  it("detects dedicated cycleway highway as separated", () => {
    const infra = extractInfrastructure({ highway: "cycleway" });
    expect(infra.hasBicycleInfra).toBe(true);
    expect(infra.isSeparated).toBe(true);
  });

  it("detects footway as separated", () => {
    const infra = extractInfrastructure({ highway: "footway" });
    expect(infra.hasPedestrianPath).toBe(true);
    expect(infra.isSeparated).toBe(true);
  });

  it("detects shoulder", () => {
    const infra = extractInfrastructure({ shoulder: "yes" });
    expect(infra.hasShoulder).toBe(true);
  });

  it("detects left/right/both shoulder", () => {
    expect(extractInfrastructure({ shoulder: "left" }).hasShoulder).toBe(true);
    expect(extractInfrastructure({ shoulder: "right" }).hasShoulder).toBe(true);
    expect(extractInfrastructure({ shoulder: "both" }).hasShoulder).toBe(true);
  });

  it("detects segregated path", () => {
    const infra = extractInfrastructure({ highway: "path", segregated: "yes" });
    expect(infra.isSeparated).toBe(true);
  });

  // ─── cycleway:left / cycleway:right / cycleway:both ───────────────────────

  it("detects cycleway:right=lane as dedicated path", () => {
    const infra = extractInfrastructure({ highway: "tertiary", "cycleway:right": "lane" });
    expect(infra.hasBicycleInfra).toBe(true);
  });

  it("detects cycleway:left=track as dedicated and separated", () => {
    const infra = extractInfrastructure({ highway: "secondary", "cycleway:left": "track" });
    expect(infra.hasBicycleInfra).toBe(true);
    expect(infra.isSeparated).toBe(true);
  });

  it("detects cycleway:both=lane as dedicated path", () => {
    const infra = extractInfrastructure({ highway: "residential", "cycleway:both": "lane" });
    expect(infra.hasBicycleInfra).toBe(true);
  });

  it("detects cycleway:both=track as separated", () => {
    const infra = extractInfrastructure({ highway: "residential", "cycleway:both": "track" });
    expect(infra.isSeparated).toBe(true);
  });

  it("ignores cycleway:right=no", () => {
    const infra = extractInfrastructure({ highway: "residential", "cycleway:right": "no" });
    expect(infra.hasBicycleInfra).toBe(false);
  });

  it("detects shared_busway as dedicated", () => {
    const infra = extractInfrastructure({ "cycleway:right": "shared_busway" });
    expect(infra.hasBicycleInfra).toBe(true);
  });

  // ─── bicycle_road / cyclestreet ───────────────────────────────────────────

  it("detects bicycle_road=yes as dedicated path", () => {
    const infra = extractInfrastructure({ highway: "residential", bicycle_road: "yes" });
    expect(infra.hasBicycleInfra).toBe(true);
  });

  it("detects cyclestreet=yes as dedicated path", () => {
    const infra = extractInfrastructure({ highway: "residential", cyclestreet: "yes" });
    expect(infra.hasBicycleInfra).toBe(true);
  });

  // ─── traffic calming ──────────────────────────────────────────────────────

  it("detects traffic_calming=bump", () => {
    const infra = extractInfrastructure({ highway: "residential", traffic_calming: "bump" });
    expect(infra.hasTrafficCalming).toBe(true);
  });

  it("detects traffic_calming=chicane", () => {
    const infra = extractInfrastructure({ highway: "residential", traffic_calming: "chicane" });
    expect(infra.hasTrafficCalming).toBe(true);
  });

  it("does not detect traffic_calming=no", () => {
    const infra = extractInfrastructure({ highway: "residential", traffic_calming: "no" });
    expect(infra.hasTrafficCalming).toBe(false);
  });

  it("detects living_street as traffic calmed", () => {
    const infra = extractInfrastructure({ highway: "living_street" });
    expect(infra.hasTrafficCalming).toBe(true);
  });

  it("returns false for hasTrafficCalming with no calming tags", () => {
    const infra = extractInfrastructure({ highway: "residential" });
    expect(infra.hasTrafficCalming).toBe(false);
  });
});

describe("extractOneWay", () => {
  it("returns false for undefined tags", () => {
    expect(extractOneWay(undefined)).toBe(false);
  });

  it("returns false for bidirectional roads", () => {
    expect(extractOneWay({ highway: "residential" })).toBe(false);
    expect(extractOneWay({ oneway: "no" })).toBe(false);
  });

  it("returns true for oneway=yes", () => {
    expect(extractOneWay({ oneway: "yes" })).toBe(true);
  });

  it("returns true for oneway=true", () => {
    expect(extractOneWay({ oneway: "true" })).toBe(true);
  });

  it("returns true for oneway=1", () => {
    expect(extractOneWay({ oneway: "1" })).toBe(true);
  });

  it("returns true for roundabouts", () => {
    expect(extractOneWay({ junction: "roundabout" })).toBe(true);
  });

  it("returns true for reverse one-way", () => {
    expect(extractOneWay({ oneway: "-1" })).toBe(true);
    expect(extractOneWay({ oneway: "reverse" })).toBe(true);
  });
});

describe("isReverseOneWay", () => {
  it("returns false for normal one-way", () => {
    expect(isReverseOneWay({ oneway: "yes" })).toBe(false);
  });

  it("returns true for oneway=-1", () => {
    expect(isReverseOneWay({ oneway: "-1" })).toBe(true);
  });

  it("returns true for oneway=reverse", () => {
    expect(isReverseOneWay({ oneway: "reverse" })).toBe(true);
  });
});

describe("extractSpeedLimit", () => {
  it("returns undefined for no maxspeed tag", () => {
    expect(extractSpeedLimit(undefined)).toBeUndefined();
    expect(extractSpeedLimit({})).toBeUndefined();
  });

  it("parses numeric speed in km/h", () => {
    expect(extractSpeedLimit({ maxspeed: "50" })).toBe(50);
    expect(extractSpeedLimit({ maxspeed: "30" })).toBe(30);
  });

  it("parses speed with km/h unit", () => {
    expect(extractSpeedLimit({ maxspeed: "50 km/h" })).toBe(50);
  });

  it("converts mph to km/h", () => {
    expect(extractSpeedLimit({ maxspeed: "30 mph" })).toBe(48); // 30 * 1.60934 ≈ 48
    expect(extractSpeedLimit({ maxspeed: "25 mph" })).toBe(40);
  });

  it("handles walking speed", () => {
    expect(extractSpeedLimit({ maxspeed: "walk" })).toBe(5);
    expect(extractSpeedLimit({ maxspeed: "walking" })).toBe(5);
  });

  it("returns undefined for maxspeed=none", () => {
    expect(extractSpeedLimit({ maxspeed: "none" })).toBeUndefined();
  });

  it("returns undefined for invalid values", () => {
    expect(extractSpeedLimit({ maxspeed: "fast" })).toBeUndefined();
    expect(extractSpeedLimit({ maxspeed: "variable" })).toBeUndefined();
  });
});

describe("extractLanes", () => {
  it("returns undefined for no lanes tag", () => {
    expect(extractLanes(undefined)).toBeUndefined();
    expect(extractLanes({})).toBeUndefined();
  });

  it("parses lane count", () => {
    expect(extractLanes({ lanes: "2" })).toBe(2);
    expect(extractLanes({ lanes: "4" })).toBe(4);
  });

  it("returns undefined for invalid values", () => {
    expect(extractLanes({ lanes: "many" })).toBeUndefined();
  });
});

describe("extractName", () => {
  it("returns undefined for no name", () => {
    expect(extractName(undefined)).toBeUndefined();
    expect(extractName({})).toBeUndefined();
  });

  it("returns name tag", () => {
    expect(extractName({ name: "Main Street" })).toBe("Main Street");
  });

  it("falls back to ref", () => {
    expect(extractName({ ref: "US-131" })).toBe("US-131");
  });

  it("falls back to official_name", () => {
    expect(extractName({ official_name: "State Highway 1" })).toBe("State Highway 1");
  });

  it("prefers name over ref", () => {
    expect(extractName({ name: "Main Street", ref: "SR-1" })).toBe("Main Street");
  });
});
