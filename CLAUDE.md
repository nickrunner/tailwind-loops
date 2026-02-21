# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (types → builder → routing)
pnpm test             # Run all tests
pnpm -r clean         # Clean build artifacts
```

Package-specific (run from package dir):
```bash
pnpm build            # Build this package
pnpm test             # Run tests (vitest)
npx vitest run        # Run tests once
```

Server + Tuner:
```bash
cd packages/server && pnpm dev     # API server on port 3000
cd packages/tuner && pnpm dev      # Vite dev server on port 3456 (proxies API to :3000)
```

Scripts (from `packages/routing/` or `packages/builder/`):
```bash
npx tsx scripts/export-corridors.ts --score=road-cycling --corridors-only
npx tsx scripts/attribute-report.ts   # Generate coverage report
```

## Docker

```bash
docker compose build                    # Build server image
docker compose up overpass              # Start Overpass (first run imports MI PBF, ~15-30 min)
docker compose up                       # Start full stack (Overpass + server)
docker compose down                     # Stop all services
docker compose down -v                  # Stop + remove volumes (clears Overpass DB + cache)
```

Test Overpass directly:
```bash
curl "http://localhost:8080/api/interpreter?data=[out:json];node(42.9,-85.7,43.0,-85.6);out%201;"
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OVERPASS_ENDPOINT` | `https://overpass-api.de/api/interpreter` | Overpass API URL. Set to local instance for production. |
| `ELEVATION_TILES_DIR` | *(unset — elevation skipped)* | Path to SRTM HGT tiles. Enables elevation enrichment when set. |
| `CACHE_DIR` | `~/.tailwind-loops` | Parent dir for network cache (`<CACHE_DIR>/network-cache/`). |
| `PORT` | `3000` | Server listen port. |

## Monorepo Structure

```
packages/
  types/           Shared domain types (zero deps, everything imports from here)
  builder/         Data ingestion, enrichment, elevation, corridor construction
  routing/         Scoring, export, search, LLM integration
  server/          Express + TSOA REST API server
  clients-core/    HTTP client wrappers (axios-based, zero React deps)
  clients-react/   React hooks + context provider (wraps clients-core)
  tuner/           Vite + React web UI for tuning scoring parameters
configs/
  scoring/
    base/      Per-activity-type scoring defaults (road-cycling.json, etc.)
    profiles/  Named presets that extend base configs (pro-cyclist.json, etc.)
data/
  michigan/grand-rapids/   OSM PBF + SRTM HGT tiles for test region
```

**Build order matters**: `types` → `builder` → `routing` → `server` → `clients-core` → `clients-react`.

### Client Architecture Pattern

End-to-end data flow: **TSOA controllers** (server) → **core client functions** (`clients-core`) → **`useRemote`-wrapped React hooks** (`clients-react`). Server state flows top-down via props from page components.

### React Component Design (Atomic Design)

| Level | Description | Examples | Server State? |
|-------|-------------|----------|---------------|
| **Atoms** | Smallest UI primitives, fully presentational | `Slider`, `Button`, `Checkbox`, `Select`, `Badge`, `ScoreBar` | Never |
| **Molecules** | Compositions of atoms, still presentational | `CollapsibleSection`, `SliderGroup`, `ScoreBarChart`, `ElevationChart` | Never |
| **Organisms** | Compositions of molecules, may have local UI state | `Sidebar`, `TunerMap`, `TopBar`, `Footer` | Never — receives via props |
| **Pages** | Full screens — **this is where server state lives** | `TunerPage` | Yes — all hooks here |

**Key rule**: All `useRemote`/mutation hooks live at the **page level**. Pages fetch data and pass request/response objects down as props. Components below pages are pure/presentational (may have local UI state like open/closed, but no network calls).

## Architecture

Tailwind Loops is a corridor-based route engine for human-powered activities. The key insight: route on **corridors** (continuous stretches with uniform character) rather than individual street segments, producing routes with sustained "flow."

### Activity Types

Four activity types with fundamentally different preferences:

| Activity | Surface | Character | Notes |
|----------|---------|-----------|-------|
| `road-cycling` | Must be paved (gravel = 0) | Rural roads, collectors | Trails deprioritized (ped traffic, stops) |
| `gravel-cycling` | Prefers gravel/dirt | Trails, rural roads | Paved is acceptable, not ideal |
| `running` | Prefers soft surfaces | Trails, paths, neighborhoods | |
| `walking` | Very permissive | Paths, trails, neighborhoods | |

### Three-Level Abstraction

1. **Graph** — Street network from OSM. Nodes (intersections) with elevation, stop/signal/crossing flags. Edges (segments) with rich attributes: road class, surface classification, infrastructure, speed limit, elevation gain/loss/grade, stop/signal/crossing counts, and multi-source enrichment metadata.

2. **Corridors** — Derived from graph by chaining compatible edges. A 5-mile rail-trail becomes one corridor. Each corridor has aggregated attributes (length, predominant surface, stop density, crossing density, bicycle infra continuity, elevation profile, hilliness index) and per-activity scores across 6 dimensions.

3. **Connectors** — Short segments linking corridors at intersections. Have their own attributes: crossing difficulty (factoring in signals, stops, major road presence), which affects route quality at transitions.

### Data Pipeline

```
OSM PBF / Overpass API
        ↓
    Graph Builder ──→ Graph (nodes + edges)
        ↓                    ↓
    Elevation Enrichment     Enrichment Pipeline
    (SRTM HGT tiles)        (Gravelmap, Mapillary, etc.)
        ↓                    ↓
        └──── Enriched Graph ────┘
                    ↓
            Corridor Builder
            (chain → classify → aggregate → name → score)
                    ↓
            CorridorNetwork (corridors + connectors + adjacency)
                    ↓
            Route Search (TODO: M3)
```

### Corridor Construction Pipeline

1. **Chain building** — Group compatible adjacent edges using edge compatibility scoring (road class, surface, name, infrastructure similarity). Bidirectional dedup ensures one corridor per road.

2. **Chain classification** — Three heuristics determine corridor vs connector:
   - Infrastructure-aware variable length thresholds (dedicated infra: 400m, named bike infra: 800m, unnamed: 1609m)
   - Name continuity bonus (consistent name halves required length)
   - Homogeneity filter (inconsistent chains need more length)

3. **Attribute aggregation** — Length-weighted predominant values for road class, surface, speed limit. Stop/signal/crossing density from OSM node tags (including implicit trail-road crossings). Elevation metrics from DEM: total gain/loss, average/max grade, hilliness index, elevation profile.

4. **Classification** — Corridor type assignment: `trail`, `path`, `neighborhood`, `rural-road`, `collector`, `arterial`, `mixed`.

5. **Scoring** — Six scoring dimensions per activity type, all parameterized and tunable.

### Scoring System

Six dimensions, weighted per activity type:

| Dimension | What it measures |
|-----------|-----------------|
| **Flow** | Length (log curve) + stop density (exponential decay). Rewards long uninterrupted stretches. |
| **Safety** | Bicycle infra, separation, speed limit, road class, traffic calming. Weighted sub-components. |
| **Surface** | Activity-specific surface preference × surface confidence. Road cycling: paved=1, gravel=0. |
| **Character** | Corridor type preference × crossing density decay. Road cycling: rural-road=0.9, trail=0.3. |
| **Scenic** | Scenic designation fraction × configurable boost. |
| **Elevation** | Hill preference matching (flat/rolling/hilly/any) + max grade penalty. Uses hilliness index. |

**Scoring configuration** is layered:
- `configs/scoring/base/<activity>.json` — full default params per activity type
- `configs/scoring/profiles/<name>.json` — partial overrides extending a base (deep-merged)
- Hardcoded defaults in `scoring.ts` as fallback

The **tuner** (`packages/tuner/`) is a Vite + React app using react-leaflet for map display and atomic design for components. It connects to the server via `clients-react` hooks. All server state lives in `TunerPage`; components below are pure/presentational.

### Enrichment Pipeline

Multi-source data fusion framework in `packages/builder/src/enrichment/`:

- **Provider interface** — Pluggable data sources (Gravelmap, Mapillary, municipal data, etc.) return observations for a bounding box
- **Spatial index** — R-tree-like grid index for efficient edge matching (point detections → nearest edges)
- **Per-attribute fusion strategies** — Each enrichable attribute (surface, speed-limit, bicycle-infra, etc.) has its own fusion strategy with source-specific confidence weights
- **Edge enrichment metadata** — `EdgeEnrichment` stores per-attribute confidence + raw observations for transparency

Enrichable attributes: `surface`, `speed-limit`, `stop-sign`, `traffic-signal`, `road-crossing`, `bicycle-infra`, `traffic-calming`, `scenic`.

### Elevation System

SRTM HGT tile reader in `packages/builder/src/elevation/`:
- Reads 1-arc-second (~30m) or 3-arc-second (~90m) HGT files
- Per-node elevation lookup, per-edge gain/loss/grade computation
- Corridor-level: total gain/loss, average/max grade, hilliness index, sampled elevation profile

### Stop/Signal Detection

Three sources of stop controls:
1. **Explicit OSM tags** — `highway=stop`, `highway=traffic_signals` on nodes
2. **Explicit crossings** — `highway=crossing` on nodes (only counted on trail/cycleway edges)
3. **Implicit crossings** — Nodes shared between trail/cycleway ways and road ways (trail-road intersections)

Road crossings only affect trail/cycleway stop density. Road-to-road intersections use explicit stop/signal tags only.

### Key Domain Types (in `@tailwind-loops/types`)

| Type | Description |
|------|-------------|
| `Graph` | Nodes + edges + adjacency. Foundation layer. |
| `GraphNode` | Coordinate + elevation + stop/signal/crossing flags |
| `EdgeAttributes` | Road class, surface, infra, speed, lanes, elevation, stop counts, enrichment |
| `SurfaceClassification` | Surface type + confidence + observations from multiple sources |
| `Corridor` | Name, type, aggregated attributes, edge IDs, geometry, per-activity scores |
| `Connector` | Edge IDs, corridor IDs, crossing difficulty, signal/stop flags |
| `CorridorNetwork` | Corridors + connectors + adjacency graph |
| `ActivityType` | `road-cycling` \| `gravel-cycling` \| `running` \| `walking` |
| `ScoringParams` | Full parameterized scoring config (weights, flow, safety, surface, character, scenic, elevation) |
| `EnrichableAttribute` | Union of attributes that can be enriched from external sources |
| `Observation` | Single data point from a source, with confidence |

### Module Responsibilities

| Package | Module | Purpose |
|---------|--------|---------|
| `types` | `*` | All shared domain types, zero dependencies |
| `builder` | `ingestion/osm/` | OSM PBF parsing, graph building, tag extraction |
| `builder` | `ingestion/overpass/` | Overpass API queries with caching |
| `builder` | `elevation/` | SRTM HGT reader, graph elevation enrichment |
| `builder` | `enrichment/` | Multi-source fusion pipeline, spatial index |
| `builder` | `corridors/` | Chain building, classification, attribute aggregation, corridor construction |
| `builder` | `geofabrik/` | Automated PBF downloads by region |
| `builder` | `location/` | Bbox utilities (center+radius, expansion) |
| `routing` | `corridors/scoring.ts` | Parameterized 6-dimension scoring engine |
| `routing` | `corridors/scoring-config.ts` | Layered JSON config loading (base + profile) |
| `routing` | `export/` | GeoJSON export (corridors, connectors, score heatmaps) |
| `routing` | `search/` | Corridor-aware route search (stub) |
| `routing` | `llm/` | Intent interpretation, corridor description (stub) |
| `server` | `controllers/` | TSOA REST API controllers (config, routes, regions, health) |
| `server` | `services/` | Business logic (network cache, region build, route generation) |
| `clients-core` | `*Client.ts` | HTTP client wrappers for each API domain |
| `clients-react` | `hooks/` | React Query hooks wrapping clients-core |
| `tuner` | `pages/TunerPage.tsx` | Page component that owns all server state |
| `tuner` | `components/` | Atomic design components (atoms/molecules/organisms) |

## Testing

Tests use **Vitest**. Run from package dir or monorepo root.

```bash
npx vitest run                    # All tests in current package
npx vitest run src/corridors/     # Tests in a subdirectory
npx vitest run --watch            # Watch mode
```

Test data: Grand Rapids, MI metro area (~216K nodes, ~570K edges, ~1K corridors).

## Project Status

| Milestone | Status | Description |
|-----------|--------|-------------|
| M1: Graph Ingestion | ✅ Done | OSM parsing, graph building, surface classification |
| M2: Corridor Construction | ✅ Done | Chain building, dedup, classification, attribute aggregation |
| M2.5: Corridor Scoring | ✅ Done | 6-dimension scoring, tuner UI, config system |
| M3: Routing | 🔜 Next | A* search on corridor network, loop generation |
| M4: Infrastructure & Data | Planned | Multi-source enrichment, persistence |
| M5: Application | Planned | User-facing route planning |

## Important Conventions

- **Never push to main directly.** Always work on branches and submit PRs.
- **TypeScript strict mode** with `noPropertyAccessFromIndexSignature` — use bracket notation for `Record<string, unknown>` properties.
- **Hex colors in GeoJSON** — HSL is not supported by most viewers (geojson.io, QGIS). Use hex.
- **pnpm** for package management (available via corepack shims).
- Corridor types changed: `quiet-road` → split into `neighborhood` + `rural-road`.
- Surface scores use simplified keys: `paved`, `unpaved`, `unknown` (not individual types like `asphalt`/`concrete`).
