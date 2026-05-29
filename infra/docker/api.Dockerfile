# syntax=docker/dockerfile:1.6
#
# Dockerfile multi-stage pour mata-api (Fastify + Prisma)
# Cible : image runtime < 200 Mo, Node 22 alpine + tini, sans devDeps.

# ─────────────────────────────────────────────────────────────────
# Stage 1 · base avec pnpm
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache tini libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# ─────────────────────────────────────────────────────────────────
# Stage 2 · install (deps complètes pour build)
# ─────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────
# Stage 3 · build (compile TS, génère client Prisma)
# ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @mata/shared build
RUN pnpm --filter @mata/api exec prisma generate
RUN pnpm --filter @mata/api build

# ─────────────────────────────────────────────────────────────────
# Stage 4 · runtime (deps prod uniquement, image légère)
# ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copie deps prod isolées via pnpm deploy
RUN --mount=type=bind,from=build,source=/repo,target=/repo,rw \
    cd /repo && pnpm --filter @mata/api --prod deploy /app

# Copie artefacts buildés
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma

EXPOSE 4000
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
