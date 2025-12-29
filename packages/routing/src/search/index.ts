/**
 * Route search module.
 *
 * Responsible for finding routes that match the user's intent. The search
 * operates primarily on corridors (for flow) but falls back to the raw
 * graph for connections.
 *
 * Intent -> Policy -> Search on Corridors -> Route
 */

import type { Graph } from "../domain/index.js";
import type { CorridorNetwork } from "../domain/corridor.js";
import type { ActivityIntent, RoutingPolicy } from "../domain/intent.js";
import type { Route, RouteAlternatives } from "../domain/route.js";

/** Options for route search */
export interface SearchOptions {
  /** Maximum number of alternatives to return */
  maxAlternatives?: number;
  /** Time limit for search in milliseconds */
  timeLimitMs?: number;
  /** Prefer corridors even if slightly longer */
  preferCorridors?: boolean;
}

/** Default search options */
export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  maxAlternatives: 3,
  timeLimitMs: 5000,
  preferCorridors: true,
};

/**
 * Find a route matching the given intent.
 *
 * @param intent - The user's intent
 * @param policy - The routing policy (derived from intent)
 * @param corridorNetwork - The corridor network to search
 * @param graph - The underlying graph (for connections)
 * @param options - Search options
 * @returns The best route(s) matching the intent
 */
export async function routeWithIntent(
  _intent: ActivityIntent,
  _policy: RoutingPolicy,
  _corridorNetwork: CorridorNetwork,
  _graph: Graph,
  _options?: SearchOptions
): Promise<RouteAlternatives> {
  // TODO: Implement route search
  // 1. Snap start/end to corridor network or graph
  // 2. Run corridor-aware search (modified A* or similar)
  // 3. Score candidates against policy
  // 4. Return best route(s)
  throw new Error("Not implemented: routeWithIntent");
}

/**
 * Score a route against a policy.
 *
 * @param route - The route to score
 * @param policy - The routing policy
 * @returns A score (higher = better match)
 */
export function scoreRoute(_route: Route, _policy: RoutingPolicy): number {
  // TODO: Implement scoring logic
  // Combine corridor weights, flow, stops, infrastructure
  throw new Error("Not implemented: scoreRoute");
}
