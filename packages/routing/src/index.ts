/**
 * @tailwind-loops/routing
 *
 * Query-time operations for the corridor-based route engine:
 * scoring corridors, searching for routes, and exporting results.
 *
 * For graph construction and corridor building, see @tailwind-loops/builder.
 * For domain types, see @tailwind-loops/types.
 */

// Re-export types for convenience
export * from "@tailwind-loops/types";

// Re-export builder for convenience
export { ingestOsm, buildCorridors } from "@tailwind-loops/builder";

// Scoring
export * from "./corridors/scoring.js";
export * from "./corridors/scoring-config.js";

// Search
export * from "./search/index.js";

// LLM
export * from "./llm/index.js";

// Export
export * from "./export/index.js";
