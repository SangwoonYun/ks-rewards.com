# This repo has moved to codeberg.org/adaja/ks-rewards.com
 
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

All configuration is managed through environment variables in `.env` files:

### Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your local settings

### Production (Docker)

The application uses `.env.production` for Docker deployments. The `docker-compose.yml` automatically loads this file.

Key environment variables:

- **Scheduler Settings**:
  - `REDEMPTION_INTERVAL_MINUTES`: Redemption processing frequency (default: 2)
  - `DISCOVERY_INTERVAL_MINUTES`: Code discovery frequency (default: 15)
  - `BACKUP_INTERVAL_HOURS`: Database backup frequency (default: 6)

- **Retry Configuration**:
  - `MAX_RETRIES`: Maximum API retry attempts (default: 5)
  - `RETRY_DELAY_MS`: Delay between retries (default: 2000)
  - `MIN_REQUEST_INTERVAL_MS`: Minimum time between API requests (default: 3000)

- **Database**:
  - `DB_PATH`: Database file path (default: `./data/ks-rewards.db`)

See `.env.example` for all available options.

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
