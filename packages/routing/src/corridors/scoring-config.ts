/**
 * Layered JSON config system for scoring parameters.
 *
 * Supports base activity defaults + named profile presets with overrides.
 * Base configs are full ScoringParams; profiles are partial overrides
 * that deep-merge on top of their base.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ActivityType } from "@tailwind-loops/types";
import type { ScoringParams } from "./scoring.js";
import { getHardcodedDefaults } from "./scoring.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaseConfig extends ScoringParams {
  activityType: ActivityType;
}

export interface ProfileConfig {
  name: string;
  description: string;
  extends: ActivityType;
  overrides: DeepPartial<ScoringParams>;
}

export interface ProfileInfo {
  name: string;
  description: string;
  extends: ActivityType;
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ---------------------------------------------------------------------------
// Deep merge
// ---------------------------------------------------------------------------

/** Leaf-level deep merge: source values override target values. */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal !== null &&
      srcVal !== undefined &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === "object" &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as DeepPartial<Record<string, unknown>>,
      ) as T[keyof T];
    } else if (srcVal !== undefined) {
      result[key] = srcVal as T[keyof T];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Config directory resolution
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Walk up directories to find `configs/scoring/`.
 * Works from both source (packages/routing/src/) and compiled (packages/routing/dist/) paths.
 */
export function findConfigsRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "configs", "scoring");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: repo root relative to known package structure
  // __dirname is packages/routing/src/corridors or packages/routing/dist/corridors
  const repoRoot = resolve(__dirname, "..", "..", "..", "..");
  return join(repoRoot, "configs", "scoring");
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** Load a base config JSON for an activity type. Falls back to hardcoded defaults. */
export function loadBaseConfig(activityType: ActivityType): ScoringParams {
  const configsRoot = findConfigsRoot();
  const filePath = join(configsRoot, "base", `${activityType}.json`);

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as BaseConfig;
    // Strip the activityType field, return ScoringParams
    const { activityType: _at, ...params } = parsed;
    return params as ScoringParams;
  } catch {
    return getHardcodedDefaults(activityType);
  }
}

/** Load a profile config, merging its overrides on top of the base. */
export function loadProfileConfig(profileName: string): ScoringParams & { _profile: ProfileInfo } {
  const configsRoot = findConfigsRoot();
  const filePath = join(configsRoot, "profiles", `${profileName}.json`);

  const raw = readFileSync(filePath, "utf-8");
  const profile = JSON.parse(raw) as ProfileConfig;

  const base = loadBaseConfig(profile.extends);
  const merged = deepMerge(base as unknown as Record<string, unknown>, profile.overrides as DeepPartial<Record<string, unknown>>) as unknown as ScoringParams;

  return {
    ...merged,
    _profile: {
      name: profile.name,
      description: profile.description,
      extends: profile.extends,
    },
  };
}

/** List all available profiles from the profiles directory. */
export function listProfiles(): ProfileInfo[] {
  const configsRoot = findConfigsRoot();
  const profilesDir = join(configsRoot, "profiles");

  if (!existsSync(profilesDir)) return [];

  const files = readdirSync(profilesDir).filter((f) => f.endsWith(".json"));
  const profiles: ProfileInfo[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(profilesDir, file), "utf-8");
      const parsed = JSON.parse(raw) as ProfileConfig;
      profiles.push({
        name: parsed.name,
        description: parsed.description,
        extends: parsed.extends,
      });
    } catch {
      // Skip malformed files
    }
  }

  return profiles;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/** Write a full base config JSON for an activity type. */
export function saveBaseConfig(activityType: ActivityType, params: ScoringParams): void {
  const configsRoot = findConfigsRoot();
  const dir = join(configsRoot, "base");
  mkdirSync(dir, { recursive: true });

  const config: BaseConfig = { activityType, ...params };
  writeFileSync(join(dir, `${activityType}.json`), JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Compute a minimal diff from the base and write a profile config JSON.
 * Only values that differ from the base are stored.
 */
export function saveProfileConfig(
  name: string,
  params: ScoringParams,
  extendsActivity: ActivityType,
  description: string,
): void {
  const configsRoot = findConfigsRoot();
  const dir = join(configsRoot, "profiles");
  mkdirSync(dir, { recursive: true });

  const base = loadBaseConfig(extendsActivity);
  const overrides = computeDiff(base as unknown as Record<string, unknown>, params as unknown as Record<string, unknown>);

  const config: ProfileConfig = {
    name,
    description,
    extends: extendsActivity,
    overrides: overrides as DeepPartial<ScoringParams>,
  };

  // Use the name as filename (kebab-case)
  const filename = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  writeFileSync(join(dir, `${filename}.json`), JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/** Compute a minimal deep diff: only keys where values differ from base. */
function computeDiff(
  base: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  for (const key of Object.keys(current)) {
    const baseVal = base[key];
    const curVal = current[key];

    if (
      typeof curVal === "object" &&
      curVal !== null &&
      !Array.isArray(curVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      const sub = computeDiff(baseVal as Record<string, unknown>, curVal as Record<string, unknown>);
      if (Object.keys(sub).length > 0) {
        diff[key] = sub;
      }
    } else if (curVal !== baseVal) {
      diff[key] = curVal;
    }
  }

  return diff;
}
