import axios from 'axios';
import { cleanGiftCode } from './kingshotApi';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

const API_URL = process.env.GIFTCODE_API_URL || 'http://ks-gift-code-api.whiteout-bot.com/giftcode_api.php';
const API_KEY = process.env.GIFTCODE_API_KEY || 'super_secret_bot_token_nobody_will_ever_find';

interface GiftCodeInfo {
  code: string;
  date: string;
}

/**
 * Parse gift code line from API response
 * @param line - Line in format "CODE DD.MM.YYYY"
 * @returns Parsed code and date or null if invalid
 */
function parseGiftCodeLine(line: string): GiftCodeInfo | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }

  const [code, dateStr] = parts;

  // Validate code format (alphanumeric only)
  if (!/^[a-zA-Z0-9]+$/.test(code)) {
    return null;
  }

  // Parse date (DD.MM.YYYY)
  const dateParts = dateStr.split('.');
  if (dateParts.length !== 3) {
    return null;
  }

  const [day, month, year] = dateParts.map(p => parseInt(p, 10));
  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) {
    return null;
  }

  return {
    code: cleanGiftCode(code),
    date: date.toISOString()
  };
}

/**
 * Fetch gift codes from the external API
 * @returns Array of gift code objects
 */
export async function fetchGiftCodesFromAPI(): Promise<GiftCodeInfo[]> {
  try {
    logger.info('Fetching gift codes from external API...');

    const response = await axios.get(API_URL, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = response.data;

    if (data.error || data.detail) {
      throw new Error(data.error || data.detail || 'Unknown API error');
    }

    const apiCodes = data.codes || [];
    logger.info(`Received ${apiCodes.length} code lines from API`);

    // Parse and validate codes
    const validCodes: GiftCodeInfo[] = [];
    const invalidCodes: string[] = [];

    for (const line of apiCodes) {
      const parsed = parseGiftCodeLine(line);
      if (parsed) {
        validCodes.push(parsed);
      } else {
        invalidCodes.push(line);
      }
    }

    if (invalidCodes.length > 0) {
      logger.warn(`Found ${invalidCodes.length} invalid code lines:`, invalidCodes);
    }

    logger.info(`Parsed ${validCodes.length} valid gift codes from API`);

    return validCodes;
  } catch (error: any) {
    const msg = getErrorMessage(error);
    logger.error('Error fetching gift codes from API:', msg);

    // Handle rate limiting errors specially
    if (error.response?.status === 429 || error.response?.status === 1015) {
      logger.warn('Rate limited by API, will retry later');
    }

    return [];
  }
}

/**
 * Validate existing gift codes to check if they're still active
 */
export async function validateExistingCodes() {
  try {
    const { giftCodes } = await import('../utils/db');
    const { validateGiftCode } = await import('./redemptionService');

    // Get all validated codes (currently considered active)
    const validatedCodes = giftCodes.findByStatus('validated');

    if (validatedCodes.length === 0) {
      logger.info('No validated codes to check');
      return {
        success: true,
        checkedCodes: 0,
        expiredCodes: 0,
        stillValidCodes: 0
      };
    }

    logger.info(`Checking ${validatedCodes.length} validated code(s) for expiration...`);

    let expiredCodes = 0;
    let stillValidCodes = 0;
    const expiredCodeList: string[] = [];

    for (const codeEntry of validatedCodes) {
      try {
        logger.info(`Validating code: ${codeEntry.code}`);
        const validationResult = await validateGiftCode(codeEntry.code);

        // The validateGiftCode function already updates the database status
        // We just need to count the results
        if (validationResult.valid === false) {
          expiredCodes++;
          expiredCodeList.push(codeEntry.code);
          logger.warn(`Code ${codeEntry.code} is now expired or invalid`);
        } else if (validationResult.valid === true) {
          stillValidCodes++;
          logger.info(`Code ${codeEntry.code} is still valid`);
        }

        // Add a delay between validation checks to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        logger.error(`Error validating code ${codeEntry.code}:`, getErrorMessage(error));
      }
    }

    logger.info(`Validation check complete: ${stillValidCodes} still valid, ${expiredCodes} expired`);

    return {
      success: true,
      checkedCodes: validatedCodes.length,
      expiredCodes,
      expiredCodeList,
      stillValidCodes
    };
  } catch (error) {
    logger.error('Error during code validation:', getErrorMessage(error));
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Synchronize gift codes from external API to the local database
 */
export async function syncGiftCodes() {
  try {
    logger.info('Starting gift code synchronization...');

    const apiCodes = await fetchGiftCodesFromAPI();

    if (apiCodes.length === 0) {
      logger.info('No gift codes received from API');
      return {
        success: true,
        newCodes: 0,
        existingCodes: 0,
        totalApiCodes: 0,
        validationCheck: null
      };
    }

    const { giftCodes } = await import('../utils/db');
    const localCodes = giftCodes.findAll();

    const localCodesMap = new Map(localCodes.map(c => [c.code, c]));

    let newCodes = 0;
    let existingCodes = 0;
    const newCodeList: string[] = [];

    for (const apiCode of apiCodes) {
      try {
        if (!localCodesMap.has(apiCode.code)) {
          // New code discovered
          const result = giftCodes.insertOrIgnore(apiCode.code, 'pending', 'api', apiCode.date);
          if (result.changes > 0) {
            newCodes++;
            newCodeList.push(apiCode.code);
            logger.info(`✨ New gift code discovered: ${apiCode.code}`);
          }
        } else {
          existingCodes++;
        }
      } catch (error) {
        logger.error(`Error processing code ${apiCode.code}:`, getErrorMessage(error));
      }
    }

    logger.info(`Sync complete: ${newCodes} new, ${existingCodes} existing, ${apiCodes.length} total`);

    // Validate existing codes to check for expired ones
    logger.info('Checking existing validated codes for expiration...');
    const validationCheck = await validateExistingCodes();

    return {
      success: true,
      newCodes,
      newCodeList,
      existingCodes,
      totalApiCodes: apiCodes.length,
      validationCheck
    };
  } catch (error) {
    logger.error('Error during gift code sync:', getErrorMessage(error));
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Get statistics about gift codes
 */
export async function getGiftCodeStats() {
  const { giftCodes } = await import('../utils/db');
  return giftCodes.stats();
}
