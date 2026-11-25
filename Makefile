SHELL := /bin/bash

.PHONY: install generate dev dev-worker dev-engine dev-web start-engine test typecheck build verify clean format lint check fix \
        db-push db-generate db-migrate db-studio worker-build \
        deploy deploy-plan deploy-secrets deploy-logs docker-build

## ---- Setup --------------------------------------------------------------

install:
	bun install

## ---- Code quality -------------------------------------------------------

format:
	bun run format

lint:
	bun run lint

check:
	bun run check

fix:
	bun run check:fix

## ---- Codegen ------------------------------------------------------------

generate:
	cd engine && bun run generate

## ---- Development --------------------------------------------------------

dev-engine:
	cd engine && bun run dev

dev-web:
	cd web && bun run dev

# Full stack: generator watcher + Bun engine + Vite dev server.
dev:
	$(MAKE) generate
	trap 'kill 0' EXIT; \
	( cd engine && bun run generate:watch ) & \
	( cd engine && bun run dev:server ) & \
	( cd web && bun run dev ) & \
	wait

# Same as `dev`, but runs the engine inside the Cloudflare Workers runtime.
dev-worker:
	$(MAKE) generate
	trap 'kill 0' EXIT; \
	( cd engine && bun run generate:watch ) & \
	( cd engine && bun run worker:dev ) & \
	( cd web && VITE_API_BASE_URL=http://localhost:8787 bun run dev ) & \
	wait

start-engine:
	$(MAKE) generate
	cd engine && bun run start

## ---- Verification -------------------------------------------------------

test:
	$(MAKE) generate
	cd engine && bun test

typecheck:
	$(MAKE) generate
	cd engine && bun run typecheck
	cd web && bun run typecheck

build:
	$(MAKE) generate
	cd engine && bun run build
	cd web && bun run build

worker-build:
	$(MAKE) generate
	cd engine && bun run worker:build

verify:
	$(MAKE) check
	$(MAKE) test
	$(MAKE) typecheck
	$(MAKE) build

clean:
	rm -rf engine/dist web/dist engine/.generated web/.generated engine/.wrangler

## ---- Database -----------------------------------------------------------

# Push the schema directly (fast iteration in development).
db-push:
	cd engine && bun run db:push

# Generate a SQL migration from schema changes (commit the result).
db-generate:
	cd engine && bun run db:generate

# Apply pending migrations (use in CI/production).
db-migrate:
	cd engine && bun run db:migrate

db-studio:
	cd engine && bun run db:studio

## ---- Deployment (Hubfly space) -------------------------------------------

# One container serves the API and the web app. `hubfly.build.json` binds this
# repository to its Hubfly space project and container; see docs/HOSTING.md.
HUBFLY ?= hubfly

# Build the image, upload it and roll it out; waits for the final result.
deploy:
	@command -v $(HUBFLY) >/dev/null || { echo "The hubfly CLI is missing: https://hubfly.space/docs/cli/"; exit 1; }
	@$(HUBFLY) whoami >/dev/null 2>&1 || { echo "Not signed in to Hubfly space: run 'hubfly login' (or set HUBFLY_TOKEN)."; exit 1; }
	$(HUBFLY) deploy --mode smart --yes

# Show what a deploy would change, without building or uploading.
deploy-plan:
	$(HUBFLY) deploy plan --mode smart

# Store the values of engine/.env.production as secrets of the container.
deploy-secrets:
	bun engine/scripts/hubfly-secrets.ts

deploy-logs:
	$(HUBFLY) logs ikiraro --follow

# Build the production image locally (the same Dockerfile Hubfly space runs).
docker-build:
	docker build -t ikiraro:local .
