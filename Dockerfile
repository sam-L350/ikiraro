# syntax=docker/dockerfile:1
#
# One container for the whole app: the Bun engine serves the API and the built
# web app on the same origin, so the session cookie is first-party.
#
#   make deploy           # build and roll out to Hubfly space
#   docker build -t ikiraro . && docker run --env-file engine/.env.production -p 3000:3000 ikiraro

ARG BUN_VERSION=1.4

# ---- All dependencies (build tools included) ------------------------------
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY engine/package.json engine/package.json
COPY web/package.json web/package.json
RUN bun install --frozen-lockfile

# ---- Generate the API client and build the web app ------------------------
FROM deps AS build
COPY . .
RUN bun run --cwd engine generate
# "/" makes the web app call the API on its own origin.
RUN VITE_API_BASE_URL=/ bun run --cwd web build

# ---- Runtime dependencies of the engine only ------------------------------
FROM oven/bun:${BUN_VERSION} AS runtime-deps
WORKDIR /app
COPY package.json bun.lock ./
COPY engine/package.json engine/package.json
COPY web/package.json web/package.json
RUN bun install --frozen-lockfile --production --filter engine

# ---- Runtime ---------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app/engine

ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	WEB_DIST_DIR=/app/web/dist

# Bun links a workspace's packages from its own node_modules into the root store.
COPY --from=runtime-deps /app/node_modules /app/node_modules
COPY --from=runtime-deps /app/engine/node_modules ./node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/engine/package.json /app/engine/tsconfig.json ./
COPY --from=build /app/engine/drizzle ./drizzle
COPY --from=build /app/engine/.generated ./.generated
COPY --from=build /app/engine/src ./src
COPY --from=build /app/web/dist /app/web/dist

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
	CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/system/health'); process.exit(r.ok ? 0 : 1)"

# Apply migrations and the foundation seed, then start the server. `exec`
# hands PID 1 to the server so SIGTERM reaches its graceful shutdown.
CMD ["sh", "-c", "bun src/db/release-cli.ts && exec bun src/index.ts"]
