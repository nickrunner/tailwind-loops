# Tailwind Loops

A corridor-based route engine for human-powered activities (cycling, running, walking).

Unlike traditional shortest-path routing, Tailwind Loops thinks in terms of **corridors** - continuous stretches of road or path with consistent character. This produces routes with better "flow": fewer stops, less zig-zagging, and more enjoyable stretches.

## Project Status

**Phase**: Scaffolding / Early Development

See [docs/milestones.md](docs/milestones.md) for the development roadmap.

## Architecture

The engine operates on two levels:

1. **Graph**: Low-level street network from OpenStreetMap
2. **Corridors**: Higher-level abstraction - continuous stretches with uniform riding character

Routes are searched primarily on corridors, with the raw graph used for connections.

See [docs/architecture.md](docs/architecture.md) for details.

## Packages

| Package | Description |
|---------|-------------|
| `@tailwind-loops/routing` | Core routing engine (graph, corridors, search, LLM integration) |

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Type Check

```bash
pnpm typecheck
```

## License

TBD
