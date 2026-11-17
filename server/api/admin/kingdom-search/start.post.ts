import { startKingdomSearch } from '../../../services/kingdomSearch';

export default defineEventHandler(async (event) => {
  const { fids } = await readBody(event);

  if (!Array.isArray(fids) || fids.length === 0 || !fids.every(f => /^\d+$/.test(String(f)))) {
    throw createError({ statusCode: 400, message: 'fids must be a non-empty array of numeric FIDs' });
  }

  return await startKingdomSearch(fids.map(String));
});
