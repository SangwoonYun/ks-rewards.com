/**
 * Centralized configuration management
 * Uses Nuxt runtimeConfig so env vars can be overridden at runtime
 * with the NUXT_ prefix (e.g. NUXT_DB_PATH, NUXT_KS_ENCRYPT_KEY)
 */

/**
 * Parse a numeric setting; a missing or malformed value must fail at startup instead of turning
 * into NaN (setInterval(fn, NaN) runs every millisecond)
 */
function positiveInt(name: string, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid configuration: ${name} must be a positive integer, got "${String(value)}"`);
  }
  return n;
}

export function getConfig() {
  const rc = useRuntimeConfig();

  return {
    db: {
      path: rc.dbPath as string,
    },

    kingshot: {
      redeemUrl: rc.ksRedeemUrl as string,
      encryptKey: rc.ksEncryptKey as string,
    },

    giftCodeApi: {
      url: rc.giftCodeApiUrl as string,
      key: rc.giftCodeApiKey as string,
    },

    retry: {
      maxRetries: positiveInt('maxRetries', rc.maxRetries),
      retryDelayMs: positiveInt('retryDelayMs', rc.retryDelayMs),
      minRequestIntervalMs: positiveInt('minRequestIntervalMs', rc.minRequestIntervalMs),
      searchRequestIntervalMs: positiveInt('searchRequestIntervalMs', rc.searchRequestIntervalMs),
      redeemDelayMs: positiveInt('redeemDelayMs', rc.redeemDelayMs),
    },

    scheduler: {
      redemptionIntervalMinutes: positiveInt('redemptionIntervalMinutes', rc.redemptionIntervalMinutes),
      discoveryIntervalMinutes: positiveInt('discoveryIntervalMinutes', rc.discoveryIntervalMinutes),
      backupIntervalHours: positiveInt('backupIntervalHours', rc.backupIntervalHours),
    },

    admin: {
      username: rc.adminUsername as string,
      password: rc.adminPassword as string,
      jwtSecret: rc.adminJwtSecret as string,
    },
  } as const;
}

// Lazy singleton: works in the Nitro server context where useRuntimeConfig() is available
let _config: ReturnType<typeof getConfig> | null = null;

export const config = new Proxy({} as ReturnType<typeof getConfig>, {
  get(_target, prop) {
    if (!_config) {
      _config = getConfig();
    }
    return (_config as any)[prop];
  },
});

// Placeholder values shipped in this repository; anyone can read them
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'change-me-in-production',
  'change-me-in-production-to-a-random-64-char-string',
]);
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * In production, refuse to start with admin credentials anyone can guess (a known JWT secret lets anyone forge an admin session)
 */
export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;

  const { password, jwtSecret } = config.admin;
  const problems: string[] = [];
  if (PLACEHOLDER_SECRETS.has(jwtSecret) || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`NUXT_ADMIN_JWT_SECRET must be a random string of at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (PLACEHOLDER_SECRETS.has(password)) {
    problems.push('NUXT_ADMIN_PASSWORD must not be a placeholder value');
  }
  if (problems.length > 0) {
    throw new Error(`Insecure configuration: ${problems.join('; ')}`);
  }
}
