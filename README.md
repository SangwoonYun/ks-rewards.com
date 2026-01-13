# Kingshot Rewards – Automatic Gift Code Redemption

Automatically monitors and redeems Kingshot gift codes for registered players.

## Features

- **Automatic Monitoring**: Checks for new gift codes every 15 minutes
- **Instant Redemption**: Redeems codes immediately for newly registered users
- **Multi-User Support**: Register multiple Player IDs
- **Real-Time Updates**: See recent redemptions as they happen
- **Secure**: Uses docker for an isolated deployment

## Quick Start

### Prerequisites

- Docker and Docker Compose installed on your server

### Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

That's it! Access the website at `http://localhost:3000`

## Usage

1. Open the website
2. Enter your Player ID (found in game: Profile → Info)
3. Click "Register for Auto Redemption"
4. All current and future codes will be automatically redeemed for you

## Configuration

Edit environment variables in `docker-compose.yml`:

- `REDEMPTION_INTERVAL_MINUTES`: Redemption processing frequency (default: 2)
- `DISCOVERY_INTERVAL_MINUTES`: Code discovery frequency (default: 15)
- `AUTO_REDEEM_INTERVAL_MINUTES`: Auto-queue frequency (default: 5)

## Database

- SQLite database is stored in `./data/ks-rewards.db` and persists across container restarts.
- Backed up every 24 hours to `./backups`.

## Tech Stack

- **Frontend**: Nuxt 4 + Vue 3
- **Backend**: Nitro + TypeScript
- **Database**: SQLite (better-sqlite3)
- **Deployment**: Docker + Docker Compose

## License

Made by player **adaja** (Kingdom 847). Automatic redemption logic adapted from [justncodes](https://github.com/justncodes).

