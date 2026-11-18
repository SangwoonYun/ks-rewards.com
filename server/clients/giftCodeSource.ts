import axios from 'axios';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { config } from '../utils/config';

export interface GiftCodeInfo {
  code: string;
  date?: string;   // publish date; absent for codes listed without one
}

/**
 * Parse a DD.MM.YYYY date to an ISO string, or null if unreadable
 */
export function parseCodeDate(dateStr: string): string | null {
  const dateParts = dateStr.split('.');
  if (dateParts.length !== 3) {
    return null;
  }

  const [day = NaN, month = NaN, year = NaN] = dateParts.map(p => parseInt(p, 10));
  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return null;
  }

  // Use AOE (Anywhere on Earth, UTC-12) so a code is valid on its date regardless of timezone
  const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-12:00`);
  if (isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

/**
 * Parse a gift code line: "CODE DD.MM.YYYY", or just "CODE" for codes without a date.
 * null if the line is not a code.
 */
export function parseGiftCodeLine(line: string): GiftCodeInfo | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length > 2) {
    return null;
  }

  const [code, dateStr] = parts;

  // Validate code format (alphanumeric only)
  if (!code || !/^[a-zA-Z0-9]+$/.test(code)) {
    return null;
  }

  // Some codes have no date (permanent, or expiring at an unannounced time).
  // The date is only the publish date - whether a code still works is decided by redeeming it.
  const date = dateStr ? parseCodeDate(dateStr) : null;
  if (dateStr && !date) {
    logger.warn(`Gift code ${code} has an unreadable date "${dateStr}", treating it as undated`);
  }

  return date ? { code, date } : { code };
}

/**
 * Fetch gift codes from the external API. Empty list on failure.
 */
export async function fetchGiftCodes(): Promise<GiftCodeInfo[]> {
  try {
    logger.info('Fetching gift codes from external API...');

    const { data } = await axios.get(config.giftCodeApi.url, {
      headers: {
        'X-API-Key': config.giftCodeApi.key,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    if (data.error || data.detail) {
      throw new Error(data.error || data.detail);
    }

    const lines: string[] = data.codes || [];
    const codes: GiftCodeInfo[] = [];
    const unreadable: string[] = [];
    for (const line of lines) {
      const parsed = parseGiftCodeLine(line);
      if (parsed) codes.push(parsed);
      else unreadable.push(line);
    }

    if (unreadable.length > 0) {
      logger.warn(`Found ${unreadable.length} invalid code lines:`, unreadable);
    }
    logger.info(`Parsed ${codes.length} valid gift codes from ${lines.length} API lines`);
    return codes;
  } catch (error: any) {
    logger.error('Error fetching gift codes from API:', getErrorMessage(error));
    if (error.response?.status === 429) {
      logger.warn('Rate limited by API, will retry later');
    }
    return [];
  }
}
