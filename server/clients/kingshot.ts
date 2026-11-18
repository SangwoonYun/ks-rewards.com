import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { sleep } from '../utils/sleep';
import { RateLimiter, ipRateLimit } from './rateLimiter';
import {
  KNOWN_API_STATUSES,
  SUCCESS_STATUSES,
  CODE_EXPIRED_STATUSES,
  CODE_INVALID_STATUSES,
  PLAYER_INELIGIBLE_STATUSES,
  normalizeStatus
} from '../domain/redemptionStatus';

// Global rate limiter (redemptions, registration, admin actions)
export const rateLimiter = new RateLimiter(config.retry.minRequestIntervalMs);
// Separate limiter for the kingdom search, so it does not slow down redemptions (its interval is adjusted at runtime)
export const searchRateLimiter = new RateLimiter(config.retry.searchRequestIntervalMs, 'search');

export interface RedemptionResult {
  success: boolean;
  status: string;
  message: string;
}

// A 4xx response other than 429: retrying the same request will not help
class ClientHttpError extends Error {}

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
 * Map an API response to a normalized status (see justncodes/ks-giftcode classify())
 */
function classifyResponse(data: any): string {
  const msg = String(data.msg ?? '');
  if (data.err_code === 40001 && msg.toLowerCase().includes('not exist')) return 'ROLE_NOT_EXIST';
  if (msg.toLowerCase().includes('sign error')) return 'SIGN_ERROR';
  const status = normalizeStatus(msg);
  if (KNOWN_API_STATUSES.has(status)) return status;

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
 * Add the sign (MD5 hash) for Kingshot API requests
 */
function signPayload(data: Record<string, string | number>): Record<string, string | number> {
  const encodedData = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('&');

  const sign = crypto
    .createHash('md5')
    .update(`${encodedData}${config.kingshot.encryptKey}`)
    .digest('hex');

  return { sign, ...data };
}

/**
 * POST with rate limiting and retries:
 * - HTTP 429: every limiter pauses until Retry-After (or exponential backoff), then retry
 * - "TIMEOUT RETRY" message, network errors, 5xx: retry with backoff
 * - other 4xx: no retry
 */
async function postForm(url: string, payload: Record<string, string | number>, limiter: RateLimiter): Promise<any> {
  const retries = config.retry.maxRetries;
  const backoff = (attempt: number, base: number) => config.retry.retryDelayMs * Math.pow(base, attempt - 1);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await limiter.throttle();

      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) formData.append(key, String(value));

      const response = await axios.post(url, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers['retry-after'], 10);
        const delay = retryAfter > 0 ? retryAfter * 1000 : backoff(attempt, 2);
        ipRateLimit.hits++;
        // The next throttle() (of any limiter) waits until then
        ipRateLimit.pausedUntil = Math.max(ipRateLimit.pausedUntil, Date.now() + delay);
        logger.warn(`⚠️  Rate limit hit (429) on attempt ${attempt}/${retries}, pausing requests for ${delay}ms`);
        continue;
      }

      if (response.status >= 400) {
        throw new ClientHttpError(`Client error: HTTP ${response.status}`);
      }

      if (response.status !== 200) {
        logger.warn(`Attempt ${attempt} failed: HTTP ${response.status}`);
        continue;
      }

      const data = response.data;
      if (normalizeStatus(data?.msg) === 'TIMEOUT_RETRY' && attempt < retries) {
        const delay = backoff(attempt, 1.5);
        logger.info(`Attempt ${attempt}: Server requested retry. Waiting ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      return data;
    } catch (error: any) {
      if (error instanceof ClientHttpError) throw error;
      logger.warn(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt < retries) {
        const delay = backoff(attempt, 1.5);
        logger.info(`⏳ Waiting ${delay}ms before retry ${attempt + 1}/${retries}...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`All ${retries} attempts failed for request to ${url}`);
}

/**
 * Redeem a gift code for a player. Never throws: request failures come back as status ERROR.
 * fid: numeric player id, kid: numeric server/kingdom id, code: gift code
 */
export async function redeemGiftCode(
  fid: string,
  kid: string,
  code: string,
  limiter: RateLimiter = rateLimiter
): Promise<RedemptionResult> {
  try {
    const payload = signPayload({
      fid,
      cdk: code,
      kid,
      time: Math.floor(Date.now() / 1000)
    });

    const response = await postForm(config.kingshot.redeemUrl, payload, limiter);

    if (!response || typeof response !== 'object') {
      return { success: false, status: 'INVALID_RESPONSE', message: 'Invalid response from server' };
    }

    const status = classifyResponse(response);
    return {
      success: SUCCESS_STATUSES.includes(status),
      status,
      message: response.msg || 'No message from server'
    };
  } catch (error: any) {
    logger.error(`Error redeeming gift code ${code} for FID ${fid}:`, error.message);
    return { success: false, status: 'ERROR', message: error.message };
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
