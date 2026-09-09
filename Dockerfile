# syntax=docker/dockerfile:1
# Backend reference image: --build-arg APP=api (default) or APP=worker.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.19.0
WORKDIR /workspace

FROM base AS build
ARG APP=api
RUN case "$APP" in api|worker) ;; *) echo "APP must be api or worker" >&2; exit 1 ;; esac
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm --filter "@platform/${APP}" build

# Workspace dependency links are preserved. This Foundation image intentionally
# retains the installed workspace; production pruning is a later optimization.
FROM base AS runtime
ARG APP=api
ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0
COPY --from=build --chown=node:node /workspace /workspace
WORKDIR /workspace/apps/${APP}
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
