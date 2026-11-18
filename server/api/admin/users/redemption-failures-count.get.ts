import { getFailureCount } from '../../../utils/failureCount';

/**
 * Cached number of users on the redemption failures page (sidebar badge)
 */
export default defineEventHandler(() => {
  return { success: true, total: getFailureCount() };
});
