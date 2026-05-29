# syntax=docker/dockerfile:1.6
#
# Dockerfile multi-stage pour mata-web (Next.js PWA)
# Utilise le mode `output: standalone` de Next pour un runtime minimal.

# ─────────────────────────────────────────────────────────────────
# Stage 1 · base
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache tini libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# ─────────────────────────────────────────────────────────────────
# Stage 2 · install
# ─────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────
# Stage 3 · build
# ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @mata/shared build
RUN pnpm --filter @mata/web build

# ─────────────────────────────────────────────────────────────────
# Stage 4 · runtime
# ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

EXPOSE 3000
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
