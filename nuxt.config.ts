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
  // Override at runtime with NUXT_ prefix (e.g. NUXT_DB_PATH)
  runtimeConfig: {
    dbPath: './data/ks-rewards.db',
    ksLoginUrl: 'https://kingshot-giftcode.centurygame.com/api/player',
    ksRedeemUrl: 'https://kingshot-giftcode.centurygame.com/api/gift_code',
    ksEncryptKey: 'mN4!pQs6JrYwV9',
    giftCodeApiUrl: 'http://ks-gift-code-api.whiteout-bot.com/giftcode_api.php',
    giftCodeApiKey: 'super_secret_bot_token_nobody_will_ever_find',
    maxRetries: '5',
    retryDelayMs: '2000',
    redeemDelayMs: '1000',
    minRequestIntervalMs: '3000',
    discoveryIntervalMinutes: '15',
    redemptionIntervalMinutes: '2',
    backupIntervalHours: '6',
    public: {}
  }
})
