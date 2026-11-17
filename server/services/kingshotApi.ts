import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

/**
 * Rate limiter to ensure minimum interval between API requests
 */
export class RateLimiter {
  private lastRequestTime = 0;
  private minInterval: number;
  // Callers are chained so concurrent requests (scheduler, registration, kingdom search)
  // are released one at a time instead of all waking up after the same delay
  private chain: Promise<void> = Promise.resolve();

  constructor(minIntervalMs: number, private readonly name = 'global') {
    this.minInterval = minIntervalMs;
  }

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
        await new Promise(resolve => setTimeout(resolve, pause));
      }
      const delay = this.lastRequestTime + this.minInterval - Date.now();
      if (delay > 0) {
        logger.info(`⏱️  Rate limiting (${this.name}): waiting ${delay}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      this.lastRequestTime = Date.now();
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

// HTTP 429 responses (any limiter) and the pause they impose on every request from this server
export const ipRateLimit = { hits: 0, pausedUntil: 0 };

// Global rate limiter instance (redemptions, registration, admin actions)
const rateLimiter = new RateLimiter(config.retry.minRequestIntervalMs);
// Separate limiter for the kingdom search, so it does not slow down redemptions (its interval is adjusted at runtime)
export const searchRateLimiter = new RateLimiter(config.retry.searchRequestIntervalMs, 'search');

interface KingshotApiData {
  [key: string]: any;
}

interface RedemptionResult {
  success: boolean;
  status: string;
  message: string;
}

/**
 * Redemption status groups (statuses are normalized: uppercase, spaces -> underscores)
 */
// Redeemed (or already redeemed) for this player
export const SUCCESS_STATUSES = ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'];
// The code itself is dead for everyone
export const CODE_EXPIRED_STATUSES = ['TIME_ERROR', 'USED'];
export const CODE_INVALID_STATUSES = ['CDK_NOT_FOUND'];
// The code is valid but this player does not meet its requirements (permanent for this player)
export const PLAYER_INELIGIBLE_STATUSES = ['STOVE_LV_ERROR', 'RECHARGE_MONEY_ERROR', 'RECHARGE_MONEY_VIP_ERROR'];
// The fid/kid pair is wrong; checked by the API before it looks at the code
export const PLAYER_ERROR_STATUSES = ['USER_INFO_ERROR', 'ROLE_NOT_EXIST'];
// Worth retrying later
export const RETRYABLE_STATUSES = ['TIMEOUT_RETRY', 'TOO_FREQUENT'];

const KNOWN_STATUSES = new Set([
  ...SUCCESS_STATUSES, ...CODE_EXPIRED_STATUSES, ...CODE_INVALID_STATUSES,
  ...PLAYER_INELIGIBLE_STATUSES, ...PLAYER_ERROR_STATUSES, ...RETRYABLE_STATUSES,
  'NOT_LOGIN', 'SIGN_ERROR'
]);

// Fallback when msg is not recognized (codes from alinustermop/kingshot-auto-redeemer).
// 40006 and 40017 (player does not meet requirements) are left out: which of the
// PLAYER_INELIGIBLE_STATUSES each one is has not been confirmed.
const ERR_CODE_STATUSES: Record<number, string> = {
  20000: 'SUCCESS',
  40008: 'RECEIVED',
  40011: 'SAME_TYPE_EXCHANGE',
  40007: 'TIME_ERROR',
  40005: 'USED'
};

/**
 * Normalize a status string: trim, drop trailing punctuation, uppercase, spaces -> underscores
 */
export function normalizeStatus(status: unknown): string {
  const normalized = String(status ?? '').trim().replace(/[.!?]+$/, '').toUpperCase().replace(/\s+/g, '_');
  return normalized || 'UNKNOWN';
}

/**
 * Map an API response to a normalized status (see justncodes/ks-giftcode classify())
 */
function classifyResponse(data: any): string {
  const msg = String(data.msg ?? '');
  if (data.err_code === 40001 && msg.toLowerCase().includes('not exist')) return 'ROLE_NOT_EXIST';
  if (msg.toLowerCase().includes('sign error')) return 'SIGN_ERROR';
  const status = normalizeStatus(msg);
  if (KNOWN_STATUSES.has(status)) return status;

  // Unrecognized msg (e.g. reworded by the server): fall back to err_code
  const byCode = ERR_CODE_STATUSES[data.err_code];
  if (byCode) {
    logger.warn(`Unrecognized redeem msg "${msg}" (err_code ${data.err_code}), classified as ${byCode} by err_code`);
    return byCode;
  }
  logger.warn(`Unrecognized redeem response: err_code ${data.err_code}, msg "${msg}"`);
  return status;
}

/**
 * Generate the sign (MD5 hash) for Kingshot API requests
 */
function encodeData(data: KingshotApiData): KingshotApiData {
  const sortedKeys = Object.keys(data).sort();
  const encodedData = sortedKeys
    .map(key => {
      const value = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
      return `${key}=${value}`;
    })
    .join('&');

  const sign = crypto
    .createHash('md5')
    .update(`${encodedData}${config.kingshot.encryptKey}`)
    .digest('hex');

  return { sign, ...data };
}

/**
 * Make a POST request with retry logic, rate limiting, and exponential backoff
 */
async function makeRequest(
  url: string,
  payload: any,
  retries: number = config.retry.maxRetries,
  limiter: RateLimiter = rateLimiter
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Apply rate limiting before each request
      await limiter.throttle();

      // Convert payload to URLSearchParams format
      const formData = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        formData.append(key, String(value));
      });

      const response = await axios.post(url, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        // Check for Retry-After header
        const retryAfter = parseInt(response.headers['retry-after'], 10);
        const delay = retryAfter > 0
          ? retryAfter * 1000
          : config.retry.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        ipRateLimit.hits++;
        ipRateLimit.pausedUntil = Math.max(ipRateLimit.pausedUntil, Date.now() + delay);

        if (attempt < retries) {
          logger.warn(`⚠️  Rate limit hit (429) on attempt ${attempt}/${retries}. Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          throw new Error('Rate limit exceeded after all retries');
        }
      }

      if (response.status === 200) {
        const data = response.data;

        // Check for a timeout retry message
        if (data.msg && data.msg.trim().replace('.', '') === 'TIMEOUT RETRY') {
          if (attempt < retries) {
            const delay = config.retry.retryDelayMs * Math.pow(1.5, attempt - 1); // Exponential backoff for timeouts
            logger.info(`Attempt ${attempt}: Server requested retry. Waiting ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            logger.warn(`Attempt ${attempt}: Max retries reached after server requested retry`);
            return data;
          }
        }

        return data;
      }

      logger.warn(`Attempt ${attempt} failed: HTTP ${response.status}`);

      // Don't retry on client errors (except 429 which is handled above)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Client error: HTTP ${response.status}`);
      }
    } catch (error: any) {
      const isRateLimit = error.response?.status === 429;
      logger.warn(`Attempt ${attempt} failed: ${error.message}`);

      if (attempt < retries && !error.message.includes('Client error')) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = isRateLimit
          ? config.retry.retryDelayMs * Math.pow(2, attempt - 1)
          : config.retry.retryDelayMs * Math.pow(1.5, attempt - 1);

        logger.info(`⏳ Waiting ${delay}ms before retry ${attempt + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error.message.includes('Client error')) {
        throw error;
      }
    }
  }

  throw new Error(`All ${retries} attempts failed for request to ${url}`);
}

/**
 * Redeem a gift code for a player
 * fid: numeric player id, kid: numeric server/kingdom id, code: gift code
 */
export async function redeemGiftCode(
  fid: string,
  kid: string,
  code: string,
  limiter: RateLimiter = rateLimiter
): Promise<RedemptionResult> {
  try {
    const payload = encodeData({
      fid: fid,
      cdk: code,
      kid: kid,
      time: Math.floor(Date.now() / 1000)
    });

    const response = await makeRequest(config.kingshot.redeemUrl, payload, config.retry.maxRetries, limiter);

    // Handle specific error cases
    if (!response || typeof response !== 'object') {
      return {
        success: false,
        status: 'INVALID_RESPONSE',
        message: 'Invalid response from server'
      };
    }

    // Map response to standardized status
    const status = classifyResponse(response);

    const success = SUCCESS_STATUSES.includes(status);

    return {
      success,
      status,
      message: response.msg || 'No message from server'
    };
  } catch (error: any) {
    logger.error(`Error redeeming gift code ${code} for FID ${fid}:`, error);
    return {
      success: false,
      status: 'ERROR',
      message: error.message
    };
  }
}

// A code that never exists; the API checks the fid/kid pair before the code
const VERIFY_PROBE_CODE = 'KSREWARDSVERIFY';

export type PlayerVerification =
  | { ok: true; status: string }
  | { ok: false; reason: 'WRONG_KINGDOM' | 'NO_SUCH_PLAYER' | 'UNVERIFIED'; status: string };

/**
 * Verify that a fid/kid pair is accepted by the API, without consuming a real code
 */
export async function verifyPlayer(fid: string, kid: string, limiter: RateLimiter = rateLimiter): Promise<PlayerVerification> {
  const { status } = await redeemGiftCode(fid, kid, VERIFY_PROBE_CODE, limiter);

  // Got past the player check: the pair is valid
  if (CODE_INVALID_STATUSES.includes(status) || CODE_EXPIRED_STATUSES.includes(status) ||
      SUCCESS_STATUSES.includes(status) || PLAYER_INELIGIBLE_STATUSES.includes(status)) {
    return { ok: true, status };
  }
  if (status === 'USER_INFO_ERROR') return { ok: false, reason: 'WRONG_KINGDOM', status };
  if (status === 'ROLE_NOT_EXIST') return { ok: false, reason: 'NO_SUCH_PLAYER', status };
  return { ok: false, reason: 'UNVERIFIED', status };
}

/**
 * Clean gift code (remove whitespace and preserve original casing)
 */
export function cleanGiftCode(code: string): string {
  return code.trim();
}

