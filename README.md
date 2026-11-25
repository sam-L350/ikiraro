# Ikiraro

A trust and allocation system for learning centers: courses, evidence, verification, a learner passport, and fair hardware.

## Requirements

- [Bun](https://bun.sh) 1.2 or newer
- Docker, for the local Postgres database

## Set up

From the repository root:

```bash
make install
cp engine/.env.example engine/.env
docker compose up -d
```

`engine/.env` already points at the database started above (`postgres://postgres:postgres@localhost:5432/starterkit`). Wait until Postgres is healthy (`docker compose ps`), then create the tables and load the development data:

```bash
make db-push
cd engine && bun run db:seed
```

`make db-push` creates the tables. The seed is safe to run again. It loads roles, learning centers, courses, lesson files under `engine/.data/`, and the demo accounts listed in [docs/demo-accounts.md](docs/demo-accounts.md).

Leave `web/.env` unset for a normal local run. The web app then calls port 3000 on the same host you opened it from, which keeps the session cookie working. Copy `web/.env.example` to `web/.env` only when the engine is somewhere else, and set `VITE_API_BASE_URL` there.

Google sign-in is optional. To turn it on, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `engine/.env`, and register `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI. Email-and-password sign-in and phone codes work without Google. With SMS left unset, the engine prints each text in its log (`dev sms`) instead of sending it. Uploaded files stay on disk until R2 is configured.

## Run

```bash
make dev
```

This generates the API client, then starts the engine and the web app together.

- Web: http://localhost:5173
- Engine: http://localhost:3000

On the sign-in page, choose **Email and password** and use an account from [docs/demo-accounts.md](docs/demo-accounts.md).

Restart `make dev` after you change `engine/.env`.

## Commands

| Command | What it does |
| --- | --- |
| `make dev` | Generate the client, then run the engine and the web app |
| `make db-push` | Apply the current schema to the development database |
| `cd engine && bun run db:seed` | Load roles, centers, courses, and demo accounts |

Production deployment is described in [docs/HOSTING.md](docs/HOSTING.md).
