# Milestones

This document outlines the development roadmap for Tailwind Loops.

## M1: Graph Ingestion

**Goal**: Parse OSM data and build a navigable graph.

**Deliverables**:
- OSM PBF parser integration
- Graph construction from OSM ways
- Edge attribute extraction (road class, surface, infrastructure)
- Basic graph statistics (node count, edge count, total length)
- Simple visualization (export to GeoJSON for viewing in QGIS/etc.)

**Test region**: Grand Rapids, MI metro area

**Success criteria**: Can ingest a regional OSM extract and produce a valid graph with accurate attributes.

---

## M2: Corridor Construction

**Goal**: Derive corridors from the raw graph.

**Deliverables**:
- Edge clustering algorithm
- Corridor attribute aggregation
- Corridor type classification
- Corridor network with connections
- Corridor catalog output (JSON/GeoJSON)

**Success criteria**: Corridors match intuitive "stretches" - rail-trails are single corridors, not fragmented; residential mazes are not artificially merged.

---

## M3: Basic Routing

**Goal**: Find routes matching simple structured intent (no LLM).

**Deliverables**:
- Point snapping to graph/corridors
- Corridor-aware route search (modified A* or similar)
- Route scoring against policy
- Route output with geometry and stats

**Success criteria**: Given start/end and a simple policy, produces reasonable routes that prefer corridors and avoid unnecessary fragmentation.

---

## M4: LLM Intent Interpretation

**Goal**: Translate natural language intent into routing policy.

**Deliverables**:
- LLM integration (Anthropic/OpenAI API)
- Prompt engineering for intent → policy
- Validation and fallbacks
- Example intent library

**Success criteria**: Natural language like "30 mile road ride, avoid busy roads" produces a sensible policy that the router can use.

---

## M5: Route Critique & Refinement

**Goal**: Use LLM to evaluate and improve routes.

**Deliverables**:
- Route summarization for LLM
- Critique prompt engineering
- Feedback integration (re-routing with adjusted policy)
- Confidence scoring

**Success criteria**: LLM can identify issues like "too many short blocks" or "this section is likely stressful" and suggest improvements.

---

## M6: Learned Scoring (Stretch)

**Goal**: Distill LLM judgments into a fast scoring model.

**Deliverables**:
- Data collection from LLM evaluations
- Lightweight scoring model training
- Model integration into route search
- A/B comparison: model vs LLM

**Success criteria**: Fast model produces similar rankings to LLM-based scoring, enabling real-time routing without API calls.

---

## Future Milestones (Not Yet Scoped)

- **Web Application**: Frontend for route planning
- **Mobile Application**: On-device routing
- **Multi-Region Support**: Expand beyond test region
- **Real-Time Conditions**: Weather, traffic, closures
- **Community Feedback**: User ratings on corridors and routes
