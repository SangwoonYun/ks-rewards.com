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
        { rel: 'preconnect', href: 'https://cdn.jsdelivr.net', crossorigin: 'anonymous' },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' }
      ]
    }
  },

  modules: ['@nuxtjs/i18n'],

  // Public pages (main, legal) are translated; admin pages opt out with definePageMeta({ i18n: false }).
  // Korean keeps the unprefixed URLs (/, /privacy, /terms), other languages are prefixed (/en, /ja/terms).
  // RTL languages (Arabic) are not supported yet.
  i18n: {
    baseUrl: 'https://ks-rewards.com',
    strategy: 'prefix_except_default',
    defaultLocale: 'ko',
    locales: [
      { code: 'ko', language: 'ko-KR', name: '한국어', file: 'ko.json' },
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'ja', language: 'ja-JP', name: '日本語', file: 'ja.json' },
      { code: 'zh-tw', language: 'zh-TW', name: '繁體中文', file: 'zh-tw.json' },
      { code: 'zh-cn', language: 'zh-CN', name: '简体中文', file: 'zh-cn.json' },
      { code: 'de', language: 'de', name: 'Deutsch', file: 'de.json' },
      { code: 'fr', language: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'ru', language: 'ru', name: 'Русский', file: 'ru.json' },
      { code: 'tr', language: 'tr', name: 'Türkçe', file: 'tr.json' },
      { code: 'es', language: 'es', name: 'Español', file: 'es.json' },
      { code: 'it', language: 'it', name: 'Italiano', file: 'it.json' },
      { code: 'pl', language: 'pl', name: 'Polski', file: 'pl.json' },
      { code: 'pt', language: 'pt', name: 'Português', file: 'pt.json' },
      { code: 'th', language: 'th', name: 'ไทย', file: 'th.json' },
      { code: 'id', language: 'id', name: 'Indonesia', file: 'id.json' }
    ],
    // On the first visit to / only, move to the browser's language; the choice is kept in a cookie
    // (disclosed in the privacy policy)
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root'
    }
  },

  // Design tokens and base styles (admin-only styles are imported by the admin layout)
  css: ['~/assets/css/base.css'],

  // Static images (e.g. the default avatar shown for every user without one): let browsers reuse
  // them across page loads instead of revalidating each time
  routeRules: {
    '/images/**': { headers: { 'cache-control': 'public, max-age=604800' } }
  },

  // Nitro configuration (server engine)
  nitro: {
    experimental: {
      // API docs (/_openapi.json, /_scalar) only in development: they list every admin route
      openAPI: process.env.NODE_ENV !== 'production'
    }
  },

  // Runtime config for environment variables
  // Override at runtime with NUXT_ prefix (e.g. NUXT_DB_PATH)
  runtimeConfig: {
    dbPath: './data/ks-rewards.db',
    ksRedeemUrl: 'https://kingshot-giftcode.centurygame.com/api/gift_code',
    ksEncryptKey: 'mN4!pQs6JrYwV9',
    giftCodeApiUrl: 'http://ks-gift-code-api.whiteout-bot.com/giftcode_api.php',
    giftCodeApiKey: 'super_secret_bot_token_nobody_will_ever_find',
    maxRetries: '5',
    retryDelayMs: '2000',
    redeemDelayMs: '1000',
    minRequestIntervalMs: '3000',
    searchRequestIntervalMs: '2000',
    discoveryIntervalMinutes: '15',
    redemptionIntervalMinutes: '2',
    backupIntervalHours: '6',
    adminUsername: 'admin',
    adminPassword: '',
    adminJwtSecret: 'change-me-in-production',
    public: {}
  }
})
