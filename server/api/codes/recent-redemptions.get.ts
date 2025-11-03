import { redemptions } from '../../utils/db';
import { logger } from '../../utils/logger';

export default defineEventHandler(async (event) => {
  try {
    const recentRedemptions = await redemptions.findRecent(50);

    return {
      success: true,
      redemptions: recentRedemptions
    };
  } catch (error: any) {
    logger.error('Error getting recent redemptions:', error);
    return {
      success: false,
      error: 'Internal server error'
    };
  }
});

