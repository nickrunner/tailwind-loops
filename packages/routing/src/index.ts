/**
 * @tailwind-loops/routing
 *
 * A corridor-based route engine for human-powered activities.
 *
 * Key concepts:
 * - Graph: Low-level street network from OSM
 * - Corridor: Higher-level abstraction for continuous stretches with flow
 * - Intent: What the user wants from their route
 * - Route: The result of routing
 *
 * Pipeline:
 * 1. Ingest OSM data -> Graph
 * 2. Build corridors from graph -> CorridorNetwork
 * 3. User provides intent -> RoutingPolicy (via LLM or direct)
 * 4. Search for route matching policy -> Route
 */

// Domain types
export * from "./domain/index.js";

// Modules
export * from "./ingestion/index.js";
export * from "./corridors/index.js";
export * from "./search/index.js";
export * from "./llm/index.js";
