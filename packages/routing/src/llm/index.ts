/**
 * LLM reasoning layer.
 *
 * The LLM serves as a reasoning layer, not a pathfinder. It:
 * - Interprets natural language intent into structured routing policy
 * - Labels and describes corridors using measured attributes
 * - Critiques routes at a high level
 *
 * The LLM should never invent geometry or raw map data - it reasons
 * about the structure and quality of routes based on computed attributes.
 */

import type { ActivityIntent, RoutingPolicy } from "../domain/intent.js";
import type { Corridor } from "../domain/corridor.js";
import type { Route } from "../domain/route.js";

/** LLM provider configuration */
export interface LlmConfig {
  /** API endpoint or provider identifier */
  provider: "anthropic" | "openai" | "local";
  /** Model identifier */
  model: string;
  /** API key (if required) */
  apiKey?: string;
}

/** Critique of a route from the LLM */
export interface RouteCritique {
  /** Overall assessment */
  summary: string;
  /** Specific concerns */
  concerns: string[];
  /** Positive aspects */
  strengths: string[];
  /** Suggested improvements (if any) */
  suggestions: string[];
  /** Confidence in the critique (0-1) */
  confidence: number;
}

/** Description of a corridor from the LLM */
export interface CorridorDescription {
  /** Human-readable description */
  description: string;
  /** Key characteristics highlighted */
  highlights: string[];
  /** Suitable activities */
  suitableFor: ("cycling" | "running" | "walking")[];
}

/**
 * Interpret natural language intent into a routing policy.
 *
 * @param naturalLanguage - The user's description of what they want
 * @param baseIntent - Partially filled intent with coordinates, activity type
 * @param config - LLM configuration
 * @returns A complete routing policy
 */
export async function interpretIntent(
  _naturalLanguage: string,
  _baseIntent: Partial<ActivityIntent>,
  _config: LlmConfig
): Promise<RoutingPolicy> {
  // TODO: Implement LLM-based intent interpretation
  // 1. Send natural language + context to LLM
  // 2. Parse structured response into RoutingPolicy
  // 3. Validate and fill defaults
  throw new Error("Not implemented: interpretIntent");
}

/**
 * Critique a route using LLM reasoning.
 *
 * @param route - The route to critique
 * @param intent - The original intent
 * @param config - LLM configuration
 * @returns A critique with concerns and suggestions
 */
export async function critiqueRoute(
  _route: Route,
  _intent: ActivityIntent,
  _config: LlmConfig
): Promise<RouteCritique> {
  // TODO: Implement LLM-based route critique
  // 1. Summarize route stats and segments
  // 2. Ask LLM to evaluate against intent
  // 3. Parse critique response
  throw new Error("Not implemented: critiqueRoute");
}

/**
 * Generate a human-readable description of a corridor.
 *
 * @param corridor - The corridor to describe
 * @param config - LLM configuration
 * @returns A description with highlights
 */
export async function describeCorridor(
  _corridor: Corridor,
  _config: LlmConfig
): Promise<CorridorDescription> {
  // TODO: Implement LLM-based corridor description
  // 1. Format corridor attributes
  // 2. Ask LLM to generate natural description
  // 3. Parse response
  throw new Error("Not implemented: describeCorridor");
}
