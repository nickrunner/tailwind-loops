# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm typecheck        # Type check all packages
pnpm -r clean         # Clean build artifacts
```

Package-specific commands (from `packages/routing/`):
```bash
pnpm build            # Build this package
pnpm typecheck        # Type check this package
```

## Architecture

Tailwind Loops is a corridor-based route engine for human-powered activities (cycling, running, walking). The key insight is routing on **corridors** (continuous stretches with uniform character) rather than individual street segments, which produces routes with better "flow".

### Three-Level Abstraction

1. **Graph** (low-level): Street network from OSM with nodes (intersections) and edges (segments). Each edge has a `SurfaceClassification` with confidence scores from multiple data sources.

2. **Corridors** (high-level): Derived from graph by clustering contiguous similar edges. These are the primary routing unit—a 3-mile rail-trail becomes one corridor, not hundreds of edges.

3. **Connectors** (linking): Short segments that connect corridors together. These represent transitions between corridors—intersection crossings, short blocks linking two streets, etc. Connectors have their own attributes (crossing difficulty, signals, stops) that factor into route scoring.

### Data Pipeline

```
OSM + Gravelmap + other sources → Graph (with surface confidence) → Corridors + Connectors → Route Search
                                                                                    ↑
                                                       User Intent → RoutingPolicy ─┘
```

The pipeline produces a `CorridorNetwork` containing both corridors and connectors, which forms the graph that routing operates on.

### Key Domain Concepts

- **SurfaceClassification**: Surface type + confidence score (0-1) + observations from multiple sources. Surface is critical for cycling—gravel vs paved determines route viability.
- **ActivityIntent**: What user wants (activity type, distance, surface/traffic tolerance)
- **RoutingPolicy**: Weights and constraints derived from intent, used by search
- **Corridor**: Continuous stretch with CorridorType (trail, path, neighborhood, rural-road, collector, arterial)
- **Connector**: Short segment linking corridors, with attributes for crossing difficulty, signals, stops

### Corridor Network Model

The `CorridorNetwork` is the primary structure for routing:

```
    ═══════════════╗         ╔═══════════════════════
    CORRIDOR A     ║         ║     CORRIDOR C
    (rail trail)   ║         ║     (residential)
    ═══════════════╝         ╚═══════════════════════
                   │         │
                   └────┬────┘
                        │
                   [CONNECTOR]  ← short segment, scores crossing difficulty
                        │
                   ┌────┴────┐
                   │         │
    ───────────────┘         └───────────────────────
              CORRIDOR B (quiet neighborhood)
```

- **Corridors**: Long stretches (100m+ typically) with uniform character
- **Connectors**: Short segments (<100m typically) that link corridors
- **Adjacency**: Graph structure where both corridors and connectors are nodes

This abstraction reduces a 100k+ edge graph to perhaps 1-5k corridors + connectors, making routing much faster while preserving route quality.

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| `domain/` | Core types: Graph, Corridor, Connector, Intent, Route, SurfaceClassification |
| `ingestion/` | OSM parsing + surface enrichment from providers (Gravelmap, etc.) |
| `corridors/` | Cluster edges into corridors and connectors, classify by type |
| `search/` | Corridor-aware route search with policy scoring |
| `llm/` | Intent interpretation, corridor description, route critique |

### LLM Role

The LLM is a reasoning layer, not a pathfinder:
- Interprets natural language intent → RoutingPolicy
- Labels corridors using measured attributes
- Critiques routes at high level

All spatial reasoning uses computed attributes from real data.

## Project Status

Currently in scaffolding phase. See `docs/milestones.md` for roadmap (M1: Graph Ingestion → M6: Learned Scoring).
