import { giftCodes, type GiftCode } from '../../utils/db';
import { logger } from '../../utils/logger';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const { status } = query;

    let codes: GiftCode[];
    if (status && typeof status === 'string') {
      codes = giftCodes.findByStatus(status);
    } else {
      codes = giftCodes.findAll(100); // Limit to last 100 codes by default
    }

    // Get stats using the new helper
    const stats = giftCodes.stats();

    return {
      success: true,
      codes,
      stats
    };
  } catch (error: any) {
    logger.error('Error getting gift codes:', error);
    return {
      success: false,
      error: 'Internal server error'
    };
  }
});

