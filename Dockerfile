# syntax=docker/dockerfile:1
# Backend: --target runtime --build-arg APP=api|worker.
# Frontend: --target frontend --build-arg APP=web-public|dashboard|admin.
FROM node:24.20.0-bookworm-slim AS base
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

FROM base AS frontend-build
ARG APP=web-public
RUN case "$APP" in web-public|dashboard|admin) ;; *) echo "Invalid frontend APP" >&2; exit 1 ;; esac
ENV NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@platform/${APP}" build
RUN mkdir -p "apps/${APP}/public"

# --target frontend --build-arg APP=web-public|dashboard|admin
FROM node:24.20.0-bookworm-slim AS frontend
ARG APP=web-public
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1 FRONTEND_APP=${APP}
WORKDIR /app
COPY --from=frontend-build --chown=node:node /workspace/apps/${APP}/.next/standalone ./
COPY --from=frontend-build --chown=node:node /workspace/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=frontend-build --chown=node:node /workspace/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "exec node apps/${FRONTEND_APP}/server.js"]

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
