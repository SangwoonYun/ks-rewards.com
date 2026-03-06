import { giftCodes, type GiftCode } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const status = query.status as string;
  const search = (query.search as string || '').trim().toLowerCase();
  const limit = parseInt(query.limit as string) || 50;
  const offset = parseInt(query.offset as string) || 0;

  let codes: GiftCode[];
  if (status && typeof status === 'string') {
    codes = giftCodes.findByStatus(status);
  } else {
    codes = giftCodes.findAll();
  }

  if (search) {
    codes = codes.filter(c => c.code.toLowerCase().includes(search));
  }

  const total = codes.length;
  const paginated = codes.slice(offset, offset + limit);
  const stats = giftCodes.stats();

  return { success: true, codes: paginated, total, hasMore: offset + limit < total, stats };
});
