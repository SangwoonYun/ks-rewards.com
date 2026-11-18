// Server modules run outside Nitro here: provide the Nitro globals they use
process.env.LOG_LEVEL = 'error';

(globalThis as any).useRuntimeConfig = () => ({
  dbPath: ':memory:',
  ksRedeemUrl: 'http://localhost/redeem',
  ksEncryptKey: 'test',
  giftCodeApiUrl: 'http://localhost/codes',
  giftCodeApiKey: 'test',
  maxRetries: '1',
  retryDelayMs: '1',
  redeemDelayMs: '1',
  minRequestIntervalMs: '1',
  searchRequestIntervalMs: '1',
  discoveryIntervalMinutes: '1',
  redemptionIntervalMinutes: '1',
  backupIntervalHours: '1',
  adminUsername: 'admin',
  adminPassword: '',
  adminJwtSecret: 'test',
});

(globalThis as any).createError = (opts: { statusCode: number; message: string }) =>
  Object.assign(new Error(opts.message), opts);
