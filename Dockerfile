FROM node:22-slim

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config files first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy all package.json + tsconfig files for dependency install
COPY packages/types/package.json packages/types/tsconfig.json packages/types/
COPY packages/builder/package.json packages/builder/tsconfig.json packages/builder/
COPY packages/routing/package.json packages/routing/tsconfig.json packages/routing/
COPY packages/server/package.json packages/server/tsconfig.json packages/server/tsoa.json packages/server/

# Install dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source for server-relevant packages only
COPY packages/types/src packages/types/src
COPY packages/builder/src packages/builder/src
COPY packages/routing/src packages/routing/src
COPY packages/server/src packages/server/src

# Copy scoring configs (needed at runtime)
COPY configs configs

# Build in dependency order
RUN pnpm --filter @tailwind-loops/types build && \
    pnpm --filter @tailwind-loops/builder build && \
    pnpm --filter @tailwind-loops/routing build && \
    pnpm --filter @tailwind-loops/server build

EXPOSE 3000

CMD ["pnpm", "--filter", "@tailwind-loops/server", "start"]
