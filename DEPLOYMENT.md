# Kingshot Rewards - Docker Deployment

## Quick Start

### 1. Build and Start
```bash
docker-compose up -d
```

### 2. View Logs
```bash
docker-compose logs -f
```

### 3. Stop
```bash
docker-compose down
```

## Deployment Commands

### Initial Deployment
```bash
# Clone or copy your project to the server
cd /path/to/ks-rewards-nuxt

# Build and start the container
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f ks-rewards
```

### Update Deployment
```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Or use a single command
docker-compose up -d --build
```

### Database Management

The SQLite database is persisted in the `./data` directory:
```bash
# Backup database
cp ./data/ks-rewards.db ./data/ks-rewards.db.backup

# Restore database
cp ./data/ks-rewards.db.backup ./data/ks-rewards.db
docker-compose restart
```

## Environment Variables

Edit `docker-compose.yml` to customize:

- `REDEMPTION_INTERVAL_MINUTES`: How often to process redemption queue and validate codes (default: 2)
- `DISCOVERY_INTERVAL_MINUTES`: How often to check for new codes from external API (default: 5)
- `BACKUP_INTERVAL_HOURS`: How often to backup the database (default: 6)
- `MAX_RETRIES`: Number of retry attempts for API calls (default: 5)
- `RETRY_DELAY_MS`: Base delay between retries in milliseconds (default: 2000)
- `MIN_REQUEST_INTERVAL_MS`: Minimum interval between API requests in milliseconds (default: 3000)
- `REDEEM_DELAY_MS`: Delay between processing redemptions in milliseconds (default: 2000)

## Production Setup with Nginx (Optional)

### 1. Create nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    upstream ks-rewards {
        server ks-rewards:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        location / {
            proxy_pass http://ks-rewards;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### 2. Uncomment Nginx section in docker-compose.yml

### 3. For SSL (with Let's Encrypt):
```bash
# Install certbot
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/

# Update nginx.conf with SSL configuration
```

## Troubleshooting

### View logs
```bash
docker-compose logs -f ks-rewards
```

### Restart service
```bash
docker-compose restart ks-rewards
```

### Execute commands in container
```bash
docker-compose exec ks-rewards sh
```

### Check database
```bash
docker-compose exec ks-rewards ls -la /app/data
```

### Remove everything and start fresh
```bash
docker-compose down -v
docker-compose up -d --build
```

## Monitoring

### Check container health
```bash
docker-compose ps
```

### Check resource usage
```bash
docker stats ks-rewards
```

## Port Configuration

Default port: `3000`

To change the port, edit `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Maps port 8080 on host to 3000 in container
```

## Security Notes

1. **Change default API keys** in production (GIFTCODE_API_KEY)
2. **Use environment variables** for sensitive data
3. **Enable firewall** and only expose necessary ports
4. **Regular backups** of the database
5. **Keep Docker images updated**: `docker-compose pull && docker-compose up -d`

