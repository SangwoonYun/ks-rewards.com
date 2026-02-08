/**
 * Centralized configuration management
 * Uses Nuxt runtimeConfig so env vars can be overridden at runtime
 * with the NUXT_ prefix (e.g. NUXT_DB_PATH, NUXT_KS_ENCRYPT_KEY)
 */

export function getConfig() {
  const rc = useRuntimeConfig();

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(String(process.env.PORT || '3000'), 10),

    db: {
      path: rc.dbPath as string,
    },

    kingshot: {
      loginUrl: rc.ksLoginUrl as string,
      redeemUrl: rc.ksRedeemUrl as string,
      encryptKey: rc.ksEncryptKey as string,
    },

    giftCodeApi: {
      url: rc.giftCodeApiUrl as string,
      key: rc.giftCodeApiKey as string,
    },

    retry: {
      maxRetries: parseInt(String(rc.maxRetries), 10),
      retryDelayMs: parseInt(String(rc.retryDelayMs), 10),
      minRequestIntervalMs: parseInt(String(rc.minRequestIntervalMs), 10),
      redeemDelayMs: parseInt(String(rc.redeemDelayMs), 10),
    },

    scheduler: {
      redemptionIntervalMinutes: parseInt(String(rc.redemptionIntervalMinutes), 10),
      discoveryIntervalMinutes: parseInt(String(rc.discoveryIntervalMinutes), 10),
      backupIntervalHours: parseInt(String(rc.backupIntervalHours), 10),
    },
  } as const;
}

// Backward-compatible export: lazy singleton
// Works in Nitro server context where useRuntimeConfig() is available
let _config: ReturnType<typeof getConfig> | null = null;

export const config = new Proxy({} as ReturnType<typeof getConfig>, {
  get(_target, prop) {
    if (!_config) {
      _config = getConfig();
    }
    return (_config as any)[prop];
  },
});
