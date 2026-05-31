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
# Les variables NEXT_PUBLIC_* sont GRAVÉES dans le bundle client au moment du
# `next build` → elles DOIVENT être fournies en build args (pas au runtime).
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_KEYCLOAK_URL
ARG NEXT_PUBLIC_KEYCLOAK_REALM=mata
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=mata-web
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_HCAPTCHA_SITEKEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SHOW_MOCKUP
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL \
    NEXT_PUBLIC_KEYCLOAK_REALM=$NEXT_PUBLIC_KEYCLOAK_REALM \
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID \
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME \
    NEXT_PUBLIC_HCAPTCHA_SITEKEY=$NEXT_PUBLIC_HCAPTCHA_SITEKEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_SHOW_MOCKUP=$NEXT_PUBLIC_SHOW_MOCKUP
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
