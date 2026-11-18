import axios from 'axios';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

const KINGDOM_TRACKER_URL = 'https://kingshot.net/api/kingdom-tracker';

/**
 * Highest kingdom number that exists, from kingshot.net's public kingdom tracker.
 * null (no upper bound) on failure.
 */
export async function fetchMaxKingdom(): Promise<number | null> {
  try {
    const { data } = await axios.get(KINGDOM_TRACKER_URL, {
      params: { sort: 'kingdomId-desc', limit: 1 },
      timeout: 5000
    });
    const max = Number(data?.data?.servers?.[0]?.kingdomId);
    if (!Number.isInteger(max) || max < 1) throw new Error('Unexpected response');
    return max;
  } catch (error) {
    logger.warn(`Could not get the highest kingdom: ${getErrorMessage(error)}`);
    return null;
  }
}
