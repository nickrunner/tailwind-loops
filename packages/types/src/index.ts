/**
 * @tailwind-loops/types
 *
 * Shared domain types for the corridor-based routing engine.
 *
 * - Graph: Low-level street network from OSM
 * - Corridor: Higher-level abstraction for continuous stretches
 * - Intent: What the user wants from their route
 * - Route: The result of routing
 */

export * from "./graph.js";
export * from "./corridor.js";
export * from "./intent.js";
export * from "./route.js";
export * from "./geo.js";
