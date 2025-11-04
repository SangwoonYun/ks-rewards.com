// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Enable SSR (default, but explicit for clarity)
  ssr: true,

  // App configuration
  app: {
    head: {
      title: 'Kingshot Rewards — Automatic Gift Code Redemption',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Automatic gift code redemption service for Kingshot players' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap' }
      ]
    }
  },

  // Nitro configuration (server engine)
  nitro: {
    experimental: {
      openAPI: true
    }
  },

  // Runtime config for environment variables
  runtimeConfig: {
    // Private keys (server-side only)
    dbPath: process.env.DB_PATH || './data/ks-rewards.db',
    ksLoginUrl: process.env.KS_LOGIN_URL || 'https://kingshot-giftcode.centurygame.com/api/player',
    ksRedeemUrl: process.env.KS_REDEEM_URL || 'https://kingshot-giftcode.centurygame.com/api/gift_code',
    ksEncryptKey: process.env.KS_ENCRYPT_KEY || 'mN4!pQs6JrYwV9',
    maxRetries: process.env.MAX_RETRIES || '3',
    retryDelayMs: process.env.RETRY_DELAY_MS || '2000',
    redeemDelayMs: process.env.REDEEM_DELAY_MS || '1000',
    discoveryIntervalMinutes: process.env.DISCOVERY_INTERVAL_MINUTES || '15',
    redemptionIntervalMinutes: process.env.REDEMPTION_INTERVAL_MINUTES || '2',

    // Public keys (exposed to client)
    public: {
      // Add any public config here if needed
    }
  }
})
