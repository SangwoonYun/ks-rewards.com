import { users } from '../../../../db';
import { startBulkRefresh } from '../../../../services/playerLookup';
import { requireFidList } from '../../../../utils/http';

// Refreshes the users selected in the user grid (body.fids); unknown fids are skipped
export default defineEventHandler(async (event) => {
  const fids = requireFidList(await readBody(event).catch(() => null));
  return startBulkRefresh(fids.filter(fid => users.findByFid(fid)));
});
