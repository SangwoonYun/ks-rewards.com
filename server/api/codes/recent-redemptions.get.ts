import { redemptions } from '../../db';

export default defineEventHandler(() => {
  return { success: true, redemptions: redemptions.findRecentSuccesses(50) };
});
