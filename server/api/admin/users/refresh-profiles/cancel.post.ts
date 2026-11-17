import { cancelBulkRefresh, getBulkRefreshStatus } from '../../../../services/playerLookup';

export default defineEventHandler(() => {
  cancelBulkRefresh();
  return getBulkRefreshStatus();
});
