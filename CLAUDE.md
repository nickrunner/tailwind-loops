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

### Two-Level Abstraction

1. **Graph** (low-level): Street network from OSM with nodes (intersections) and edges (segments). Each edge has a `SurfaceClassification` with confidence scores from multiple data sources.

2. **Corridors** (high-level): Derived from graph by clustering contiguous similar edges. These are the primary routing unit—a 3-mile rail-trail becomes one corridor, not hundreds of edges.

### Data Pipeline

```
OSM + Gravelmap + other sources → Graph (with surface confidence) → Corridors → Route Search
                                                                         ↑
                                            User Intent → RoutingPolicy ─┘
```

### Key Domain Concepts

- **SurfaceClassification**: Surface type + confidence score (0-1) + observations from multiple sources. Surface is critical for cycling—gravel vs paved determines route viability.
- **ActivityIntent**: What user wants (activity type, distance, surface/traffic tolerance)
- **RoutingPolicy**: Weights and constraints derived from intent, used by search
- **Corridor**: Continuous stretch with CorridorType (trail, path, quiet-road, collector, arterial)

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| `domain/` | Core types: Graph, Corridor, Intent, Route, SurfaceClassification |
| `ingestion/` | OSM parsing + surface enrichment from providers (Gravelmap, etc.) |
| `corridors/` | Cluster edges into corridors, classify by type |
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
