import { giftCodes, type GiftCode } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const status = query.status as string;
  const search = (query.search as string || '').trim().toLowerCase();

  let codes: GiftCode[];
  if (status && typeof status === 'string') {
    codes = giftCodes.findByStatus(status);
  } else {
    codes = giftCodes.findAll();
  }

  if (search) {
    codes = codes.filter(c => c.code.toLowerCase().includes(search));
  }

  const stats = giftCodes.stats();

  return { success: true, codes, stats };
});
