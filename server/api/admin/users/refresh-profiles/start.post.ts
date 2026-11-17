import { startBulkRefresh } from '../../../../services/playerLookup';
import { filterUsers } from '../../../../utils/userFilters';

// Refreshes the users matching the user grid's filters (body); every user when no filter is set
export default defineEventHandler(async (event) => {
  const filters = (await readBody(event).catch(() => null)) ?? {};
  return startBulkRefresh(filterUsers(filters).map(u => u.fid));
});
