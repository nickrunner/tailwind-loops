/**
 * Chain classification: determines whether an edge chain qualifies as a
 * corridor or remains a connector.
 *
 * Three complementary heuristics replace the previous single length threshold:
 * 1. Infrastructure-aware variable threshold (dedicated infra needs less length)
 * 2. Name continuity bonus (consistent name halves the required length)
 * 3. Homogeneity filter (inconsistent chains need more length)
 */

import type { Graph, RoadClass } from "@tailwind-loops/types";
import type { EdgeChain } from "./chain-builder.js";
import type { CorridorBuilderOptions } from "./index.js";
import { edgeCompatibility } from "./edge-compatibility.js";
import { nameConsistency } from "./corridor-attributes.js";

/** Per-tier minimum length overrides */
export interface MinLengthByTier {
  /** Dedicated infra: cycleway/path + isSeparated (default 400m) */
  dedicatedInfra?: number;
  /** Named road with bicycle infrastructure (default 800m) */
  namedBikeInfra?: number;
  /** Any named road — same as unnamed by default; name alone doesn't promote (default 1609m) */
  namedRoad?: number;
  /** Unnamed residential/service/unclassified (uses base minLengthMeters) */
  unnamed?: number;
}

const DEFAULT_MIN_LENGTH_BY_TIER: Required<MinLengthByTier> = {
  dedicatedInfra: 400,
  namedBikeInfra: 800,
  namedRoad: 1609,
  unnamed: 1609,
};

/** Road classes that indicate dedicated cycling/walking infrastructure */
const DEDICATED_INFRA_CLASSES = new Set<RoadClass>([
  "cycleway",
  "path",
  "footway",
]);

/**
 * Compute the average pairwise edge compatibility across consecutive edges
 * in a chain. Returns 1.0 for single-edge chains.
 *
 * A low homogeneity score (< 0.7) means the chain includes edges that barely
 * passed the compatibility threshold during chain building — it doesn't "feel"
 * like one corridor.
 */
export function chainHomogeneity(
  edgeIds: string[],
  graph: Graph,
  options?: CorridorBuilderOptions
): number {
  if (edgeIds.length <= 1) return 1.0;

  let totalScore = 0;
  const pairs = edgeIds.length - 1;

  for (let i = 0; i < pairs; i++) {
    const edgeA = graph.edges.get(edgeIds[i]!)!;
    const edgeB = graph.edges.get(edgeIds[i + 1]!)!;
    totalScore += edgeCompatibility(edgeA.attributes, edgeB.attributes, options);
  }

  return totalScore / pairs;
}

/**
 * Determine the infrastructure tier of a chain by scanning its edges.
 *
 * Tiers (in priority order):
 * 1. dedicatedInfra: majority of length is cycleway/path/footway + separated
 * 2. namedBikeInfra: has a name AND majority has bicycle infrastructure
 * 3. namedRoad: has a name
 * 4. unnamed: fallback
 */
function classifyChainTier(
  chain: EdgeChain,
  graph: Graph
): keyof MinLengthByTier {
  let totalLength = 0;
  let dedicatedInfraLength = 0;
  let bikeInfraLength = 0;
  let namedLength = 0;

  for (const edgeId of chain.edgeIds) {
    const edge = graph.edges.get(edgeId)!;
    const len = edge.attributes.lengthMeters;
    totalLength += len;

    if (
      DEDICATED_INFRA_CLASSES.has(edge.attributes.roadClass) &&
      edge.attributes.infrastructure.isSeparated
    ) {
      dedicatedInfraLength += len;
    }

    if (edge.attributes.infrastructure.hasBicycleInfra) {
      bikeInfraLength += len;
    }

    if (edge.attributes.name) {
      namedLength += len;
    }
  }

  if (totalLength === 0) return "unnamed";

  // Majority (>50%) thresholds for tier classification
  if (dedicatedInfraLength / totalLength > 0.5) return "dedicatedInfra";

  const hasName = namedLength / totalLength > 0.5;
  if (hasName && bikeInfraLength / totalLength > 0.5) return "namedBikeInfra";
  if (hasName) return "namedRoad";

  return "unnamed";
}

/**
 * Compute the effective minimum length for a chain to qualify as a corridor.
 *
 * Combines three heuristics:
 * 1. Infrastructure tier → base threshold
 * 2. Name continuity bonus: if >= 80% of length shares one name, halve the threshold
 * 3. Homogeneity penalty: if avg compatibility < 0.7, multiply threshold by 1/homogeneity
 */
export function getEffectiveMinLength(
  chain: EdgeChain,
  graph: Graph,
  options?: CorridorBuilderOptions & { minLengthByTier?: MinLengthByTier }
): number {
  const tierConfig = {
    ...DEFAULT_MIN_LENGTH_BY_TIER,
    ...options?.minLengthByTier,
  };

  // If minLengthByTier is not provided, use the base minLengthMeters as the unnamed tier
  if (!options?.minLengthByTier && options?.minLengthMeters != null) {
    tierConfig.unnamed = options.minLengthMeters;
  }

  // 1. Infrastructure tier → base threshold
  const tier = classifyChainTier(chain, graph);
  let threshold = tierConfig[tier];

  // 2. Name continuity bonus: consistent name across >= 80% of length → halve threshold
  const nameCoverage = nameConsistency(chain.edgeIds, graph);
  if (nameCoverage >= 0.8) {
    threshold *= 0.5;
  }

  // 3. Homogeneity penalty: low internal consistency → inflate threshold
  const homogeneity = chainHomogeneity(chain.edgeIds, graph, options);
  if (homogeneity < 0.7) {
    threshold *= 1 / homogeneity;
  }

  return threshold;
}
