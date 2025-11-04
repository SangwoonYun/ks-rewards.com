import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';

const LOGIN_URL = process.env.KS_LOGIN_URL || 'https://kingshot-giftcode.centurygame.com/api/player';
const REDEEM_URL = process.env.KS_REDEEM_URL || 'https://kingshot-giftcode.centurygame.com/api/gift_code';
const ENCRYPT_KEY = process.env.KS_ENCRYPT_KEY || 'mN4!pQs6JrYwV9';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5');
const BASE_RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || '2000');
const MIN_REQUEST_INTERVAL_MS = parseInt(process.env.MIN_REQUEST_INTERVAL_MS || '3000'); // 3 seconds between requests

/**
 * Rate limiter to ensure minimum interval between API requests
 */
class RateLimiter {
  private lastRequestTime = 0;
  private minInterval: number;

  constructor(minIntervalMs: number) {
    this.minInterval = minIntervalMs;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const delay = this.minInterval - timeSinceLastRequest;
      logger.info(`⏱️  Rate limiting: waiting ${delay}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter(MIN_REQUEST_INTERVAL_MS);

interface KingshotApiData {
  [key: string]: any;
}

interface ValidationResult {
  success: boolean;
  nickname?: string;
  kingdom?: string;
  avatar_url?: string;
  data?: any;
  error?: string;
}

interface RedemptionResult {
  success: boolean;
  status: string;
  message: string;
  nickname?: string;
  kingdom?: string;
  avatar_url?: string;
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
    .update(`${encodedData}${ENCRYPT_KEY}`)
    .digest('hex');

  return { sign, ...data };
}

/**
 * Make a POST request with retry logic, rate limiting, and exponential backoff
 */
async function makeRequest(url: string, payload: any, retries: number = MAX_RETRIES): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Apply rate limiting before each request
      await rateLimiter.throttle();

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
        if (attempt < retries) {
          // Check for Retry-After header
          const retryAfter = response.headers['retry-after'];
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 2s, 4s, 8s, 16s, 32s

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
            const delay = BASE_RETRY_DELAY_MS * Math.pow(1.5, attempt - 1); // Exponential backoff for timeouts
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
          ? BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
          : BASE_RETRY_DELAY_MS * Math.pow(1.5, attempt - 1);

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
 * Validate a player ID by logging in
 */
export async function validatePlayerId(fid: string): Promise<ValidationResult> {
  try {
    const payload = encodeData({
      fid: fid,
      time: Date.now()
    });

    const response = await makeRequest(LOGIN_URL, payload);

    if (response.code === 0 && response.msg === 'success') {
      return {
        success: true,
        nickname: response.data?.nickname || null,
        kingdom: response.data?.kid ? String(Math.floor(response.data.kid)) : undefined,
        avatar_url: response.data?.avatar_image || null,
        data: response.data
      };
    }

    return {
      success: false,
      error: response.msg || 'Unknown error'
    };
  } catch (error: any) {
    logger.error('Error validating player ID:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Redeem a gift code for a player
 */
export async function redeemGiftCode(fid: string, code: string): Promise<RedemptionResult> {
  try {
    // First validate the player to ensure session is active and get nickname
    const loginResult = await validatePlayerId(fid);
    if (!loginResult.success) {
      return {
        success: false,
        status: 'NOT_LOGIN',
        message: loginResult.error || 'Failed to authenticate player'
      };
    }

    const payload = encodeData({
      fid: fid,
      cdk: code,
      time: Date.now()
    });

    const response = await makeRequest(REDEEM_URL, payload);

    // Handle specific error cases
    if (!response || typeof response !== 'object') {
      return {
        success: false,
        status: 'INVALID_RESPONSE',
        message: 'Invalid response from server',
        nickname: loginResult.nickname,
        kingdom: loginResult.kingdom,
        avatar_url: loginResult.avatar_url
      };
    }

    if (response.code === -4) {
      return {
        success: false,
        status: 'NOT_LOGIN',
        message: response.msg || 'Session expired or invalid',
        nickname: loginResult.nickname,
        kingdom: loginResult.kingdom,
        avatar_url: loginResult.avatar_url
      };
    }

    // Map response to standardized status
    const rawStatus = response.msg || 'UNKNOWN';
    // Remove trailing punctuation (., !, ?) and convert to uppercase
    const status = rawStatus.toString().trim().replace(/[.!?]+$/, '').toUpperCase();

    let success = false;

    if (['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'].includes(status)) {
      success = true;
    } else if (['TIME_ERROR', 'CDK_NOT_FOUND', 'USAGE_LIMIT'].includes(status)) {
      success = false;
    } else if (status.includes('NOT_LOGIN') || status.includes('NOT LOGIN')) {
      // Special handling for login issues
      success = false;
      logger.warn(`Session expired for FID ${fid}, attempting to re-login...`);
      const reloginResult = await validatePlayerId(fid);
      if (reloginResult.success) {
        // Retry once with a new session
        const retryResponse = await makeRequest(REDEEM_URL, payload);
        if (retryResponse.code === 0) {
          return {
            success: true,
            status: retryResponse.msg || 'SUCCESS',
            message: retryResponse.msg || 'Code redeemed after re-login',
            nickname: reloginResult.nickname,
            kingdom: reloginResult.kingdom,
            avatar_url: reloginResult.avatar_url
          };
        }
      }
    }

    return {
      success,
      status,
      message: response.msg || 'No message from server',
      nickname: loginResult.nickname,
      kingdom: loginResult.kingdom,
      avatar_url: loginResult.avatar_url
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

/**
 * Clean gift code (remove whitespace and preserve original casing)
 */
export function cleanGiftCode(code: string): string {
  return code.trim();
}

