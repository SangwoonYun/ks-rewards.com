import { users } from '../../../../db';
import { startBulkRefresh } from '../../../../services/playerLookup';
import { parseUserFilters } from '../../../../utils/userFilters';

// Refreshes the users matching the user grid's filters (body); every user when no filter is set
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) ?? {};
  return startBulkRefresh(users.findFids(parseUserFilters(body)));
});
