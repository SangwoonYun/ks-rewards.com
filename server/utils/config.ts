/**
 * Centralized configuration management
 * All environment variables are loaded from .env file
 */

// Helper to get optional env variable with default
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

// Helper to parse integer with default
function getIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  // Environment
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: getIntEnv('PORT', 3000),

  // Database
  db: {
    path: getEnv('DB_PATH', './data/ks-rewards.db'),
  },

  // Kingshot API
  kingshot: {
    loginUrl: getEnv('KS_LOGIN_URL', 'https://kingshot-giftcode.centurygame.com/api/player'),
    redeemUrl: getEnv('KS_REDEEM_URL', 'https://kingshot-giftcode.centurygame.com/api/gift_code'),
    encryptKey: getEnv('KS_ENCRYPT_KEY', 'mN4!pQs6JrYwV9'),
  },

  // Gift Code API
  giftCodeApi: {
    url: getEnv('GIFTCODE_API_URL', 'http://ks-gift-code-api.whiteout-bot.com/giftcode_api.php'),
    key: getEnv('GIFTCODE_API_KEY', 'super_secret_bot_token_nobody_will_ever_find'),
  },

  // Retry Configuration
  retry: {
    maxRetries: getIntEnv('MAX_RETRIES', 5),
    retryDelayMs: getIntEnv('RETRY_DELAY_MS', 2000),
    minRequestIntervalMs: getIntEnv('MIN_REQUEST_INTERVAL_MS', 3000),
    redeemDelayMs: getIntEnv('REDEEM_DELAY_MS', 2000),
  },

  // Scheduler Configuration
  scheduler: {
    redemptionIntervalMinutes: getIntEnv('REDEMPTION_INTERVAL_MINUTES', 2),
    discoveryIntervalMinutes: getIntEnv('DISCOVERY_INTERVAL_MINUTES', 15),
    backupIntervalHours: getIntEnv('BACKUP_INTERVAL_HOURS', 6),
  },
} as const;

