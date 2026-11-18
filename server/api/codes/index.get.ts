import { giftCodes } from '../../db';

// The public code list: the newest active and expired codes
const PUBLIC_STATUSES = ['validated', 'expired'];
const LIMIT = 100;

export default defineEventHandler(() => {
  return { success: true, codes: giftCodes.findByStatuses(PUBLIC_STATUSES, LIMIT) };
});
