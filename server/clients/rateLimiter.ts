import { logger } from '../utils/logger';
import { sleep } from '../utils/sleep';

// HTTP 429 responses (any limiter) and the pause they impose on every request from this server
export const ipRateLimit = { hits: 0, pausedUntil: 0 };

/**
 * Rate limiter to ensure minimum interval between API requests
 */
export class RateLimiter {
  private lastRequestTime = 0;
  // Callers are chained so concurrent requests (queue worker, registration, kingdom search)
  // are released one at a time instead of all waking up after the same delay
  private chain: Promise<void> = Promise.resolve();

  constructor(private minInterval: number, private readonly name = 'global') {}

  get intervalMs() {
    return this.minInterval;
  }

  set intervalMs(ms: number) {
    this.minInterval = ms;
  }

  throttle(): Promise<void> {
    const next = this.chain.then(async () => {
      // HTTP 429 is an IP-level limit: every limiter holds off until the server's Retry-After has passed
      const pause = ipRateLimit.pausedUntil - Date.now();
      if (pause > 0) {
        logger.info(`⏱️  Rate limiting (${this.name}): paused ${pause}ms after HTTP 429`);
        await sleep(pause);
      }
      const delay = this.lastRequestTime + this.minInterval - Date.now();
      if (delay > 0) {
        logger.debug(`⏱️  Rate limiting (${this.name}): waiting ${delay}ms before next request`);
        await sleep(delay);
      }
      this.lastRequestTime = Date.now();
    });
    this.chain = next.catch(() => {});
    return next;
  }
}
