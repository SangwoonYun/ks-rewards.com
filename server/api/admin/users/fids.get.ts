import { users } from '../../../db';
import { parseUserFilters } from '../../../utils/userFilters';

// Every fid matching the user grid's filters (the grid's select-all checkbox)
export default defineEventHandler((event) => {
  return { success: true, fids: users.findFids(parseUserFilters(getQuery(event))) };
});
