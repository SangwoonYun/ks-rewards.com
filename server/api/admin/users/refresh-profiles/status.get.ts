import { getBulkRefreshStatus } from '../../../../services/playerLookup';

export default defineEventHandler(() => getBulkRefreshStatus());
