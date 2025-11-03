import { validatePendingCodes } from '../../services/redemptionService';
import { logger } from '../../utils/logger';

export default defineEventHandler(async (event) => {
  try {
    logger.info('Manual validation of pending codes triggered');
    const result = await validatePendingCodes();
    return {
      success: true,
      processed: result.processed,
      valid: result.valid,
      invalid: result.invalid,
      uncertain: result.uncertain,
      summary: `Processed ${result.processed} codes: ${result.valid} valid, ${result.invalid} invalid, ${result.uncertain} uncertain`
    };
  } catch (error: any) {
    logger.error('Error validating pending codes:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
