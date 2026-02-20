import { useState, useCallback } from "react";

export interface ScoringParamsState {
  weights: Record<string, number>;
  flow: Record<string, number>;
  safety: Record<string, number>;
  characterScores: Record<string, number>;
  surfaceScores: Record<string, number>;
  crossingDecayRate: number;
  surfaceConfidenceMinFactor: number;
  scenicBoost: number;
  elevation: Record<string, unknown>;
}

const EMPTY_PARAMS: ScoringParamsState = {
  weights: {},
  flow: {},
  safety: {},
  characterScores: {},
  surfaceScores: {},
  crossingDecayRate: 0.04,
  surfaceConfidenceMinFactor: 0.5,
  scenicBoost: 1.0,
  elevation: {},
};

/** Parse server response (Record<string, unknown>) into typed local state */
function parseServerParams(data: Record<string, unknown>): ScoringParamsState {
  return {
    weights: (data["weights"] as Record<string, number>) ?? {},
    flow: (data["flow"] as Record<string, number>) ?? {},
    safety: (data["safety"] as Record<string, number>) ?? {},
    characterScores: (data["characterScores"] as Record<string, number>) ?? {},
    surfaceScores: (data["surfaceScores"] as Record<string, number>) ?? {},
    crossingDecayRate: (data["crossingDecayRate"] as number) ?? 0.04,
    surfaceConfidenceMinFactor: (data["surfaceConfidenceMinFactor"] as number) ?? 0.5,
    scenicBoost: (data["scenicBoost"] as number) ?? 1.0,
    elevation: (data["elevation"] as Record<string, unknown>) ?? {},
  };
}

/** Normalize weights to sum to 1 */
function normalizeRecord(rec: Record<string, number>): Record<string, number> {
  const sum = Object.values(rec).reduce((a, b) => a + b, 0);
  if (sum <= 0) return rec;
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    result[k] = v / sum;
  }
  return result;
}

export function useScoringParams() {
  const [params, setParams] = useState<ScoringParamsState>(EMPTY_PARAMS);

  /** Load params from server response */
  const loadFromServer = useCallback((data: Record<string, unknown>) => {
    setParams(parseServerParams(data));
  }, []);

  /** Update a single param by dot-path (e.g. "weights.flow", "elevation.hillPreference") */
  const setParam = useCallback((path: string, value: number | string) => {
    setParams((prev) => {
      const parts = path.split(".");
      if (parts.length === 1) {
        // Top-level scalar
        return { ...prev, [parts[0]!]: value };
      }
      if (parts.length === 2) {
        const [section, key] = parts as [string, string];
        const sectionValue = prev[section as keyof ScoringParamsState];
        if (typeof sectionValue === "object" && sectionValue !== null) {
          return {
            ...prev,
            [section]: { ...sectionValue, [key]: value },
          };
        }
      }
      return prev;
    });
  }, []);

  /** Read normalized params for sending to server */
  const readParams = useCallback((): Record<string, unknown> => {
    return {
      weights: normalizeRecord(params.weights),
      flow: params.flow,
      safety: normalizeRecord(params.safety),
      characterScores: params.characterScores,
      surfaceScores: params.surfaceScores,
      crossingDecayRate: params.crossingDecayRate,
      surfaceConfidenceMinFactor: params.surfaceConfidenceMinFactor,
      scenicBoost: params.scenicBoost,
      elevation: params.elevation,
    };
  }, [params]);

  return { params, setParam, readParams, loadFromServer };
}
