# Kingshot Rewards

**English** | [한국어](README.ko.md)

A service that automatically discovers and validates Kingshot gift codes and redeems them on behalf of registered player accounts.
It runs as a single Nuxt 4 (Nitro) server backed by SQLite and provides both a public registration page and an admin console.

## Features

**Public page (`/`)**
- Register for auto-redemption with a player ID + kingdom number (multiple players at once)
  - The ID/kingdom pair is checked against the Kingshot API before registering; mismatches are rejected.
  - Once registered, the codes the player can still claim are queued with high priority and redeemed in the background right away.
- Lists of active and expired gift codes, recent redemptions, and the number of registered players

**Admin console (`/admin`)**

| Menu | Description |
|---|---|
| Dashboard | User / code / queue stats, recent redemptions |
| Gift Codes | Code list, manual add/delete, sync, validate pending codes, revalidate invalid codes |
| Redemptions | Redemption history, queue status (retry/remove), bulk profile refresh |
| Users | Search, filter and sort users; activate/deactivate, change kingdom, apply codes, refresh profiles |
| Redemption Failures | Users whose retries are exhausted (kingdom mismatch / account not found / other), automatic search for a player's new kingdom |
| Priority Queue | Mark users for priority processing and adjust their priority |

## How it works

```
[External code API] ──(discovery cycle)──▶ gift_codes: pending
                                            │  try the code with real users (up to 3) and decide
                                            ▼
                              validated / expired / invalid
                                            │  active users × validated codes still needed
                                            ▼
                              redemption_queue (by priority)
                                            │  a single worker claims items atomically, one at a time
                                            ▼
                              redemptions (every attempt is recorded)
```

- **Discovery cycle** (`NUXT_DISCOVERY_INTERVAL_MINUTES`): sync codes → validate pending codes (including ones left undecided earlier) → re-check validated codes for expiry (once a day) → queue the needed pairs → start the worker.
- **Queue worker**: exactly one runs in the process, claiming `pending` items one at a time in priority order (atomically, via `UPDATE … RETURNING`). It wakes up immediately when registration or an admin action adds items, and also on every interval (`NUXT_REDEMPTION_INTERVAL_MINUTES`).
- **Result handling**: every redemption goes through `server/services/redemptionExecutor.ts`.

  | Result | Queue item | Code status |
  |---|---|---|
  | Success / already claimed / not eligible | Removed | pending → validated |
  | Expired (`TIME_ERROR`, `USED`) / code not found | All queue items for the code removed | expired / invalid |
  | `TOO_FREQUENT`, `TIMEOUT_RETRY`, `USER_INFO_ERROR` | Retried on the next run, up to 3 attempts, then failed | Unchanged |
  | Other failures | failed | Unchanged |

- **Kingdom mismatch**: a pair whose latest result is `USER_INFO_ERROR` and whose kingdom has not been verified since is not re-queued automatically. Once the kingdom is verified (registration, admin change, kingdom search, profile lookup) it is queued again.
- **Rate limiting**: Kingshot API requests are serialized by a global rate limiter (`NUXT_MIN_REQUEST_INTERVAL_MS`). On HTTP 429, all requests pause for the `Retry-After` period. Kingdom search uses its own limiter (`NUXT_SEARCH_REQUEST_INTERVAL_MS`, adjusted automatically based on rate-limit signals) and never sends concurrent requests.
- **Profile lookup**: nickname, avatar and kingdom come from mightpulse.com (unofficial API). Inactive players (e.g. not logged in for 90 days) are deactivated during a bulk refresh.
- **Backups**: periodic snapshots into `backups/` using the SQLite online backup API; files older than 30 days are deleted.

## Project structure

```
app/                    Frontend (Nuxt)
  pages/                Public page, admin/* pages
  composables/          usePaginatedList, usePolling, useFlash, useSelection, useDebounceFn, useAdmin …
  components/           UserAvatar, ResultBanner, BrandMark
  middleware/           admin.global.ts (admin session check)
  plugins/              api.client.ts (admin API 401 → login page)
  utils/                format (dates), badges (status badge classes)
server/
  api/                  HTTP handlers (kept thin: validate input → call a service)
  clients/              External APIs: kingshot (redeem/verify), rateLimiter, giftCodeSource, mightpulse, kingdomTracker
  db/                   SQLite connection, versioned migrations, per-table query modules
  domain/               redemptionStatus: single source of truth for status classification
  services/             redemptionExecutor, queueWorker, codeValidation, giftCodeDiscovery,
                        scheduler, jobs (prevents duplicate runs), kingdomSearch, playerLookup, backupService
  middleware/           Auth for /api/admin/**
  plugins/init.ts       Startup: config check → migrations → scheduler
test/                   vitest (in-memory SQLite)
```

## Configuration

Configuration is read through Nuxt runtimeConfig, so **only environment variables prefixed with `NUXT_`** take effect. Defaults are in [nuxt.config.ts](nuxt.config.ts); the full list is in [.env.example](.env.example).

| Variable | Default | Description |
|---|---|---|
| `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` | `admin` / (none) | Admin account. Login is disabled if the password is empty |
| `NUXT_ADMIN_JWT_SECRET` | (placeholder) | Signing key for admin sessions. Random string, 32+ characters |
| `NUXT_DB_PATH` | `./data/ks-rewards.db` | SQLite file path |
| `NUXT_REDEMPTION_INTERVAL_MINUTES` | 2 | How often the queue worker is woken up |
| `NUXT_DISCOVERY_INTERVAL_MINUTES` | 15 | Code discovery interval |
| `NUXT_BACKUP_INTERVAL_HOURS` | 6 | Backup interval |
| `NUXT_MIN_REQUEST_INTERVAL_MS` | 3000 | Minimum interval between Kingshot API requests |
| `NUXT_REDEEM_DELAY_MS` | 1000 | Extra delay between redemptions/validations |
| `NUXT_MAX_RETRIES` / `NUXT_RETRY_DELAY_MS` | 5 / 2000 | Per-HTTP-request retry count and backoff base |
| `NUXT_SEARCH_REQUEST_INTERVAL_MS` | 2000 | Base interval for kingdom search (+1s per rate-limit signal, −1s when quiet) |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |

Startup checks:
- The server refuses to start if a numeric setting is not a positive integer.
- With `NODE_ENV=production`, the server refuses to start if the JWT secret is a placeholder or shorter than 32 characters, or if the password is a placeholder (`change-me`, etc.).

## Development

Node.js 26 LTS (24.11+ also works), [Bun](https://bun.sh) 1.3+. The Docker image is built with `node:26-alpine` + Bun 1.4.4.

```bash
bun install
cp .env.example .env      # fill in the admin account, etc.
bun run dev               # http://localhost:3000

bun run test              # vitest
bun run typecheck         # vue-tsc
bun run build             # produces .output/
```

In development mode, API docs are served at `/_scalar` and `/_openapi.json` (disabled in production builds).

## Deployment (Docker)

```bash
cp .env.example .env.production   # NUXT_ADMIN_PASSWORD and NUXT_ADMIN_JWT_SECRET are required
docker compose up -d --build
docker compose logs -f
```

- Port: host `4127` → container `3000`
- Volumes: `./data` (DB), `./backups` (backups)
- Keep secrets only in the uncommitted `.env.production`; production tuning values live under `environment` in [docker-compose.yml](docker-compose.yml) (these take precedence).
- The DB schema is migrated automatically on startup based on `PRAGMA user_version`.
- To pick up OS/Node security patches, periodically rebuild without cache: `docker compose build --pull --no-cache`.

## Notes

- The Kingshot redemption API, the code list API, mightpulse.com and kingshot.net are all unofficial/external services; their response formats and limits may change without notice.
- Original project: [codeberg.org/ks-rewards/ks-rewards.com](https://codeberg.org/ks-rewards/ks-rewards.com) — this repository is based on it, with substantially changed features and structure.
