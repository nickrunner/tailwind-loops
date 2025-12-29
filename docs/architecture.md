# Architecture

Tailwind Loops is a corridor-based route engine for human-powered activities (cycling, running, walking). This document describes the conceptual architecture and data flow.

## Core Concepts

### Graph vs Corridors

The engine operates on two levels of abstraction:

**Graph (Low-level)**
- Built from OpenStreetMap as the foundation
- Enriched with data from specialized sources (see Surface Data Fusion below)
- Nodes represent intersections and endpoints
- Edges represent individual street segments
- Each edge has attributes: road class, surface, speed limit, infrastructure
- Surface attributes include a **confidence score** based on data source agreement

**Corridors (High-level)**
- Derived from the graph by clustering similar contiguous edges
- Represent continuous stretches with uniform "riding character"
- Examples: a 3-mile rail-trail, a quiet residential street, a shouldered county road
- Corridors are the primary unit for routing decisions

Why corridors? Traditional routing operates edge-by-edge, which can lead to "spaghetti" routes through residential mazes. By routing on corridors, we naturally prefer "flow" - long continuous stretches with fewer stops and direction changes.

### Intent and Policy

**Intent** - What the user wants:
- Activity type (cycling, running, walking)
- Distance preference
- Surface tolerance (paved only? gravel okay?)
- Traffic tolerance
- Natural language description ("50km tempo ride, mostly paved")

**Policy** - How to search:
- Weights for different corridor types
- Hard constraints (avoid certain surfaces)
- Scoring weights for flow, stops, infrastructure

The LLM translates Intent → Policy. Once we have a Policy, the search is deterministic.

### LLM Integration

The LLM serves as a **reasoning layer**, not a pathfinder:

1. **Intent Interpretation**: Natural language → structured Policy
2. **Corridor Labeling**: Generate descriptions based on measured attributes
3. **Route Critique**: High-level feedback on candidate routes

The LLM never invents geometry or map data. All spatial reasoning is grounded in computed attributes from real data.

### Surface Data Fusion

Surface type is the **most critical attribute** for cycling route generation. The difference between paved and gravel can make a route unusable for a road bike or perfect for a gravel bike. Unfortunately, OSM surface data is often incomplete or inaccurate.

**Multi-Source Strategy**

We use OSM as the geometric foundation but cross-reference multiple specialized data sources to build confidence in surface classifications:

| Source | What it provides | Confidence weight |
|--------|------------------|-------------------|
| OSM `surface` tag | Direct surface classification | Medium (often missing/stale) |
| OSM `highway` tag | Inferred surface (road class → likely surface) | Low (inference only) |
| Gravelmap.com | Crowd-sourced gravel/unpaved segments | High (cycling-specific, curated) |
| Strava Heatmaps | Usage patterns by bike type (road vs gravel vs MTB) | Medium (indirect signal) |
| Satellite imagery | (Future) ML-based surface classification | Variable |

**Confidence Model**

Each edge's surface has both a **classification** and a **confidence score** (0-1):

- Single source: Low confidence (0.3-0.5)
- Multiple agreeing sources: High confidence (0.7-0.9)
- Conflicting sources: Flagged for review, use most reliable source

When sources disagree, we prefer:
1. Recent crowd-sourced data (Gravelmap) over stale OSM
2. Explicit tags over inferred values
3. Cycling-specific sources over general-purpose

**Routing Implications**

- High-confidence paved: Safe for road bikes
- High-confidence gravel: Great for gravel bikes, may warn road bikes
- Low-confidence: Surface may need verification, shown with caveat
- Unknown: Treat conservatively based on road class

## Data Flow

```
┌─────────────┐
│  OSM Data   │──────────┐
│  (PBF file) │          │
└─────────────┘          │
                         ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Gravelmap   │────▶│   Graph     │────▶│  Corridors  │
│ (API)       │     │  (nodes,    │     │  (network)  │
└─────────────┘     │   edges,    │     └──────┬──────┘
                    │   surface   │            │
┌─────────────┐     │  confidence)│            │
│ Other       │────▶│             │            │
│ Sources     │     └─────────────┘            │
└─────────────┘                                │
                                               │
┌─────────────┐     ┌─────────────┐            │
│   User      │────▶│   Intent    │            │
│   Input     │     │  + Policy   │            │
└─────────────┘     └──────┬──────┘            │
                           │                   │
                           ▼                   ▼
                    ┌──────────────────────────┐
                    │      Route Search        │
                    │  (corridor-aware A*)     │
                    └───────────┬──────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │        Route            │
                    │  (segments + stats)     │
                    └─────────────────────────┘
```

## Module Responsibilities

### `ingestion/`
- Parse OSM PBF files (geometric foundation)
- Extract relevant ways (roads, paths, trails)
- Build graph with nodes and edges
- Compute edge attributes from OSM tags
- **Data source abstraction**: pluggable providers for surface data
- **Surface enrichment**: merge data from Gravelmap, Strava, etc.
- **Confidence computation**: score surface classifications by source agreement

### `corridors/`
- Cluster contiguous edges with similar attributes
- Compute aggregated corridor attributes
- Build corridor network with connections
- Classify corridors by type

### `search/`
- Snap start/end points to graph/corridors
- Run corridor-aware route search
- Score routes against policy
- Return best route(s)

### `llm/`
- Interpret natural language intent
- Generate corridor descriptions
- Critique candidate routes
- (Future) Train scoring model from feedback

## Storage Strategy

The engine will use PostgreSQL with PostGIS for persistence:

- **Graph table**: nodes and edges with geometry
- **Corridor table**: derived corridors with attributes
- **Precomputed indices**: for fast spatial queries

For development, the graph and corridors can be held in memory or serialized to files.

## Future Considerations

### Multi-Activity Support
The architecture is activity-agnostic. Activity type affects:
- Which edges are traversable
- How infrastructure is valued
- Speed/duration estimates

### Learned Scoring
Currently, routing uses hand-tuned weights. Future versions may:
- Collect user feedback on routes
- Use LLM to evaluate routes
- Train a fast scoring model from this data

### Real-time Conditions
Future versions may incorporate:
- Weather data (surface conditions)
- Time of day (traffic, lighting)
- Seasonal closures
