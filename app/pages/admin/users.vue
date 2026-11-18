<template>
  <div class="admin-page">
    <h1 class="page-title">User Management</h1>

    <div class="toolbar">
      <button
        class="toolbar-btn btn-apply-all"
        :disabled="applyingAll"
        @click="applyAllCodes"
      >
        {{ applyingAll ? 'Applying...' : hasFilters ? `Apply Codes (${totalUsers} filtered)` : 'Apply All Codes' }}
      </button>
      <button
        class="toolbar-btn btn-refresh-all"
        :disabled="bulkRefresh?.running"
        @click="startBulkRefresh"
      >
        {{ bulkRefresh?.running ? 'Refreshing...' : hasFilters ? `Refresh Profiles (${totalUsers} filtered)` : 'Refresh All Profiles' }}
      </button>
    </div>

    <div v-if="bulkRefresh?.running" class="result-banner result-info">
      Refreshing profiles: {{ bulkRefresh.done }} / {{ bulkRefresh.total }}
      ({{ bulkRefresh.updated }} updated, {{ bulkRefresh.kingdomUpdated }} kingdom changes, {{ bulkRefresh.deactivated }} deactivated, {{ bulkRefresh.notFound }} not found, {{ bulkRefresh.failed }} failed)
      <button class="dismiss-btn" title="Cancel" @click="cancelBulkRefresh">&times;</button>
    </div>
    <ResultBanner v-else :flash="bulkRefreshFlash" @dismiss="clearBulkRefreshResult" />
    <div v-if="!bulkRefresh?.running && bulkRefreshFlash && bulkRefreshIssues.length" class="refresh-report">
      <div v-for="group in issueGroups" :key="group.reason" class="report-group">
        <strong>{{ group.label }} ({{ group.items.length }})</strong>
        <ul>
          <li v-for="i in group.items" :key="i.fid">
            {{ i.fid }} · {{ i.nickname || '-' }} · K{{ i.kingdom || '?' }}<template v-if="i.reason === 'kingdom_rejected'"> → K{{ i.detail }} rejected</template><template v-else-if="i.detail"> · {{ i.detail }}</template>
          </li>
        </ul>
      </div>
    </div>

    <ResultBanner :flash="applyAllFlash" @dismiss="clearApplyAllResult" />

    <div class="info-bar">
      <span>{{ users.length }} / {{ totalUsers }} users</span>
    </div>

    <div ref="tableWrapperRef" class="table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th v-for="col in SORT_COLUMNS" :key="col.key">
              <button v-if="col.sort" class="sort-btn" :class="{ active: sort.key === col.sort }" @click="toggleSort(col.sort)">
                {{ col.label }}
                <span class="sort-icon">{{ sort.key === col.sort ? (sort.order === 'asc' ? '▲' : '▼') : '⇅' }}</span>
              </button>
            </th>
            <th>Actions</th>
          </tr>
          <tr class="filter-row">
            <th data-label="FID"><input v-model="filters.fid" type="text" inputmode="numeric" class="filter-input filter-fid" placeholder="Contains" @input="debouncedFetch" /></th>
            <th></th>
            <th data-label="Nickname"><input v-model="filters.nickname" type="text" class="filter-input filter-nickname" placeholder="Contains" @input="debouncedFetch" /></th>
            <th data-label="Kingdom"><input v-model="filters.kingdom" type="text" inputmode="numeric" class="filter-input filter-kingdom" placeholder="Exact" @input="debouncedFetch" /></th>
            <th data-label="Status">
              <select v-model="filters.status" class="filter-input filter-status" @change="fetchUsers">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </th>
            <th data-label="Registered">
              <ClientOnly>
                <VueDatePicker
                  v-model="dateRange"
                  :range="{ partialRange: false }"
                  auto-apply
                  model-type="yyyy-MM-dd"
                  :formats="{ input: 'yy.MM.dd' }"
                  :time-config="{ enableTimePicker: false }"
                  :teleport="true"
                  placeholder="Date range"
                  class="filter-daterange"
                />
              </ClientOnly>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.fid">
            <td data-label="FID">{{ user.fid }}</td>
            <td class="avatar-cell">
              <UserAvatar :src="user.avatar_url" :alt="user.nickname || user.fid" class="avatar" />
            </td>
            <td data-label="Nickname">{{ user.nickname || '-' }}</td>
            <td data-label="Kingdom">{{ user.kingdom || '-' }}</td>
            <td data-label="Status">
              <span class="badge" :class="activeBadgeClass(user.active)">
                {{ user.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td data-label="Registered">{{ formatDate(user.created_at) }}</td>
            <td class="actions-cell">
              <button
                class="action-btn"
                :class="user.active ? 'btn-deactivate' : 'btn-activate'"
                :disabled="toggling === user.fid"
                @click="toggleUser(user)"
              >
                {{ user.active ? 'Deactivate' : 'Activate' }}
              </button>
              <button
                v-if="user.active"
                class="action-btn btn-apply"
                :disabled="applying === user.fid"
                @click="applyCodes(user)"
              >
                {{ applying === user.fid ? 'Applying...' : 'Apply Codes' }}
              </button>
              <button
                v-if="user.active"
                class="action-btn"
                :class="isPriorityUser(user.fid) ? 'btn-priority-remove' : 'btn-priority-add'"
                :disabled="togglingPriority === user.fid"
                @click="togglePriority(user)"
              >
                {{ togglingPriority === user.fid ? '...' : (isPriorityUser(user.fid) ? 'Remove Priority' : 'Add Priority') }}
              </button>
              <button
                class="action-btn btn-refresh"
                :disabled="refreshing === user.fid"
                @click="refreshProfile(user)"
              >
                {{ refreshing === user.fid ? 'Refreshing...' : 'Refresh Profile' }}
              </button>
              <span v-if="applyResults[user.fid]" class="apply-result" :class="applyResults[user.fid]?.success ? 'text-success' : 'text-error'">
                {{ applyResults[user.fid]?.message }}
              </span>
            </td>
          </tr>
          <tr v-if="users.length === 0 && !loading">
            <td colspan="7" class="empty">No users found</td>
          </tr>
          <tr v-if="hasMore">
            <td colspan="7" class="sentinel-cell">
              <div ref="sentinelRef" class="sentinel"></div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="loading">Loading...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import type { User } from '~~/server/db';

definePageMeta({
  layout: 'admin',
});

const filters = reactive({ fid: '', nickname: '', kingdom: '', status: '', from: '', to: '' });

// Registered filter as one range picker (yyyy-MM-dd local days). The picker emits the start date alone
// on the first click, so the filter only changes once both ends are picked, or when cleared.
const dateRange = ref<string[] | null>(null);
watch(dateRange, (value) => {
  const [from, to] = value ?? [];
  if (value && !(from && to)) return;
  filters.from = from ?? '';
  filters.to = to ?? '';
  fetchUsers();
});

// Column headers before Actions; sort is the server's sort key (none for the avatar column)
const SORT_COLUMNS = [
  { key: 'fid', label: 'FID', sort: 'fid' },
  { key: 'avatar', label: '', sort: null },
  { key: 'nickname', label: 'Nickname', sort: 'nickname' },
  { key: 'kingdom', label: 'Kingdom', sort: 'kingdom' },
  { key: 'status', label: 'Status', sort: 'active' },
  { key: 'registered', label: 'Registered', sort: 'created_at' },
] as const;
type SortKey = NonNullable<(typeof SORT_COLUMNS)[number]['sort']>;
// Each click on a column: ascending -> descending -> back to the default order (newest first, key null)
const sort = reactive<{ key: SortKey | null; order: 'asc' | 'desc' }>({ key: null, order: 'asc' });

function toggleSort(key: SortKey) {
  if (sort.key !== key) {
    sort.key = key;
    sort.order = 'asc';
  } else if (sort.order === 'asc') {
    sort.order = 'desc';
  } else {
    sort.key = null;
  }
  fetchUsers();
}
const toggling = ref<string | null>(null);
const applying = ref<string | null>(null);
const applyResults = ref<Record<string, { success: boolean; message: string }>>({});
const applyingAll = ref(false);
const { flash: applyAllFlash, show: showApplyAllResult, clear: clearApplyAllResult } = useFlash();
const priorityFids = ref<Set<string>>(new Set());
const togglingPriority = ref<string | null>(null);
const refreshing = ref<string | null>(null);

interface BulkRefreshStatus {
  running: boolean;
  total: number;
  done: number;
  updated: number;
  notFound: number;
  failed: number;
  kingdomUpdated: number;
  deactivated: number;
  issues: RefreshIssue[];
  stoppedReason: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}
interface RefreshIssue {
  fid: string;
  nickname: string | null;
  kingdom: string | null;
  reason: 'deactivated' | 'not_found' | 'failed' | 'kingdom_rejected';
  detail: string | null;
}
const bulkRefresh = ref<BulkRefreshStatus | null>(null);
const { flash: bulkRefreshFlash, show: showBulkRefreshFlash, clear: clearBulkRefreshFlash } = useFlash();
// Users that did not refresh cleanly in the last run, reported under its result banner
const bulkRefreshIssues = ref<RefreshIssue[]>([]);

function showBulkRefreshResult(success: boolean, message: string, issues: RefreshIssue[] = []) {
  showBulkRefreshFlash(success, message);
  bulkRefreshIssues.value = issues;
}

function clearBulkRefreshResult() {
  clearBulkRefreshFlash();
  bulkRefreshIssues.value = [];
}

// Report of the users that did not refresh cleanly, grouped by reason
const ISSUE_LABELS: Record<RefreshIssue['reason'], string> = {
  deactivated: 'Deactivated (inactive 90 days / no coordinates)',
  not_found: 'Not found on lookup site',
  kingdom_rejected: 'Lookup kingdom rejected by API',
  failed: 'Lookup failed',
};
const issueGroups = computed(() => {
  const issues = bulkRefreshIssues.value;
  return (Object.keys(ISSUE_LABELS) as RefreshIssue['reason'][])
    .map(reason => ({ reason, label: ISSUE_LABELS[reason], items: issues.filter(i => i.reason === reason) }))
    .filter(g => g.items.length > 0);
});

// Row results disappear after 5s; a newer result of the same row restarts its timer
const rowResultTimers = new Map<string, ReturnType<typeof setTimeout>>();

function showResult(fid: string, success: boolean, message: string) {
  clearTimeout(rowResultTimers.get(fid));
  applyResults.value[fid] = { success, message };
  rowResultTimers.set(fid, setTimeout(() => {
    rowResultTimers.delete(fid);
    delete applyResults.value[fid];
  }, 5000));
}

function clearResult(fid: string) {
  clearTimeout(rowResultTimers.get(fid));
  rowResultTimers.delete(fid);
  delete applyResults.value[fid];
}

async function refreshProfile(user: User) {
  refreshing.value = user.fid;
  clearResult(user.fid);
  try {
    const res = await $fetch(`/api/admin/users/${user.fid}/refresh-profile`, { method: 'POST' }) as any;
    if (res.user) {
      user.nickname = res.user.nickname;
      user.avatar_url = res.user.avatar_url;
      user.kingdom = res.user.kingdom;
      user.active = res.user.active;
    }
    const messages: Record<string, string> = {
      updated: 'Profile updated',
      not_found: 'Not found on lookup site',
      failed: 'Lookup failed',
    };
    let message = messages[res.result] ?? res.result;
    if (res.kingdom?.status === 'updated') message += `, kingdom ${res.kingdom.from} → ${res.kingdom.to}`;
    if (res.kingdom?.status === 'rejected') message += `, kingdom ${res.kingdom.to} rejected by API`;
    if (res.deactivated) {
      message += res.result === 'not_found' ? ', deactivated' : ', deactivated (inactive 90 days / no coordinates)';
      dropPriority(user.fid);
    }
    showResult(user.fid, res.success, message);
  } catch (e) {
    showResult(user.fid, false, 'Failed to refresh profile');
  } finally {
    refreshing.value = null;
  }
}

async function fetchBulkRefreshStatus() {
  try {
    const wasRunning = bulkRefresh.value?.running;
    bulkRefresh.value = await $fetch<BulkRefreshStatus>('/api/admin/users/refresh-profiles/status');
    const s = bulkRefresh.value;
    if (s.running) {
      bulkPolling.start();
    } else {
      bulkPolling.stop();
      if (wasRunning) {
        showBulkRefreshResult(
          !s.stoppedReason || s.stoppedReason === 'Cancelled',
          `Profiles refreshed: ${s.updated} updated (${s.kingdomUpdated} kingdom changes, ${s.deactivated} deactivated), ${s.notFound} not found, ${s.failed} failed` +
            (s.stoppedReason ? ` (${s.stoppedReason})` : ''),
          s.issues,
        );
        fetchUsers();
        fetchPriorityUsers();
      }
    }
  } catch (e) {
    console.error('Failed to fetch profile refresh status:', e);
  }
}
const bulkPolling = usePolling(fetchBulkRefreshStatus, 2000);

async function startBulkRefresh() {
  const targets = hasFilters.value ? `the ${totalUsers.value} user(s) matching the filters` : 'every user';
  if (!confirm(`Refresh the nickname, avatar and kingdom of ${targets} from mightpulse.com? Users not found (even by live search), inactive for 90 days or without coordinates are deactivated. This runs in the background (about 1.5s per user, up to ~15s more for users that need a live search).`)) return;
  clearBulkRefreshResult();
  try {
    bulkRefresh.value = await $fetch<BulkRefreshStatus>('/api/admin/users/refresh-profiles/start', { method: 'POST', body: filterParams() });
    if (bulkRefresh.value.total === 0) {
      showBulkRefreshResult(true, 'No users match the filters');
      return;
    }
    bulkPolling.start();
  } catch (e: any) {
    showBulkRefreshResult(false, e?.data?.message || 'Failed to start profile refresh');
  }
}

async function cancelBulkRefresh() {
  try {
    await $fetch('/api/admin/users/refresh-profiles/cancel', { method: 'POST' });
  } catch (e) {
    console.error('Failed to cancel profile refresh:', e);
  }
}

function isPriorityUser(fid: string) {
  return priorityFids.value.has(fid);
}

// The server takes deactivated users out of the priority queue
function dropPriority(fid: string) {
  if (!priorityFids.value.has(fid)) return;
  priorityFids.value.delete(fid);
  priorityFids.value = new Set(priorityFids.value);
}

async function fetchPriorityUsers() {
  try {
    const res: any = await $fetch('/api/admin/priority/queue');
    priorityFids.value = new Set(res.registeredUsers.map((u: any) => u.fid));
  } catch (e) {
    console.error('Failed to fetch priority users:', e);
  }
}

async function togglePriority(user: User) {
  togglingPriority.value = user.fid;
  try {
    if (isPriorityUser(user.fid)) {
      await $fetch('/api/admin/priority/remove', {
        method: 'POST',
        body: { fid: user.fid },
      });
      priorityFids.value.delete(user.fid);
      priorityFids.value = new Set(priorityFids.value);
    } else {
      await $fetch('/api/admin/priority/add', {
        method: 'POST',
        body: { fid: user.fid },
      });
      priorityFids.value.add(user.fid);
      priorityFids.value = new Set(priorityFids.value);
    }
  } catch (e) {
    console.error('Failed to toggle priority:', e);
  } finally {
    togglingPriority.value = null;
  }
}

// Column filters as query params (also the targets of Apply Codes / Refresh Profiles);
// the date range is in local days, sent as instants (to is exclusive)
function filterParams() {
  const params: Record<string, string> = {};
  for (const key of ['fid', 'nickname', 'kingdom', 'status'] as const) {
    if (filters[key].trim()) params[key] = filters[key].trim();
  }
  if (filters.from) params.from = new Date(`${filters.from}T00:00`).toISOString();
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00`);
    end.setDate(end.getDate() + 1);
    params.to = end.toISOString();
  }
  return params;
}

const sortParams = (): Record<string, string> => (sort.key ? { sort: sort.key, order: sort.order } : {});
const hasFilters = computed(() => Object.keys(filterParams()).length > 0);

const {
  items: users,
  total: totalUsers,
  hasMore,
  loading,
  refresh: fetchUsers,
  rootRef: tableWrapperRef,
  sentinelRef,
} = usePaginatedList<User>('/api/admin/users', {
  itemsKey: 'users',
  params: () => ({ ...sortParams(), ...filterParams() }),
});
const debouncedFetch = useDebounceFn(fetchUsers, 300);

async function toggleUser(user: User) {
  toggling.value = user.fid;
  try {
    await $fetch(`/api/admin/users/${user.fid}/toggle`, { method: 'POST' });
    user.active = user.active === 1 ? 0 : 1;
    if (!user.active) dropPriority(user.fid);
  } catch (e) {
    console.error('Failed to toggle user:', e);
  } finally {
    toggling.value = null;
  }
}

async function applyCodes(user: User) {
  applying.value = user.fid;
  clearResult(user.fid);
  try {
    // Queued codes are redeemed in the background
    const res = await $fetch(`/api/admin/users/${user.fid}/apply-codes`, { method: 'POST' }) as any;
    showResult(user.fid, res.success, res.queuedCount === 0 ? 'No codes to apply' : `Queued ${res.queuedCount} code(s)`);
  } catch (e: any) {
    showResult(user.fid, false, 'Failed to apply codes');
  } finally {
    applying.value = null;
  }
}

async function applyAllCodes() {
  const targets = hasFilters.value ? `the active users among the ${totalUsers.value} matching the filters` : 'all active users';
  if (!confirm(`Apply all validated gift codes to ${targets}? This may take a while.`)) return;

  applyingAll.value = true;
  clearApplyAllResult();
  try {
    // Queued codes are redeemed in the background
    const res = await $fetch('/api/admin/users/apply-all', { method: 'POST', body: filterParams() }) as any;
    const scope = res.targetCount === null ? '' : `${res.targetCount} filtered active user(s): `;
    showApplyAllResult(res.success, scope + (res.message || (res.queuedCount === 0
      ? 'No unredeemed codes to apply'
      : `Queued ${res.queuedCount} code(s)`)));
  } catch (e: any) {
    showApplyAllResult(false, 'Failed to apply codes for all users');
  } finally {
    applyingAll.value = false;
  }
}

onMounted(() => {
  fetchUsers();
  fetchPriorityUsers();
  // Picks up a refresh that is already running (e.g. after a page reload)
  fetchBulkRefreshStatus();
});

onUnmounted(() => {
  for (const timer of rowResultTimers.values()) clearTimeout(timer);
});
</script>

<style scoped>
.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.sort-btn:hover,
.sort-btn.active {
  color: var(--text);
}

.sort-icon {
  font-size: 0.7rem;
  opacity: 0.5;
}

.sort-btn.active .sort-icon {
  opacity: 1;
  color: var(--primary);
}

/* Both header rows (titles and filters) stay on top while scrolling */
.admin-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.admin-table th {
  position: static;
}

.filter-row th {
  padding: 8px 6px 10px;
  font-weight: 400;
}

.filter-row th:first-child {
  padding-left: 14px;
}

.filter-input {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  font-size: 0.8125rem;
  box-shadow: none;
}

.filter-fid {
  max-width: 100px;
}

.filter-nickname {
  max-width: 130px;
}

.filter-kingdom {
  max-width: 70px;
}

.filter-status {
  max-width: 100px;
  padding-right: 28px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

.filter-daterange {
  width: 170px;
}

.apply-result {
  font-size: 0.75rem;
  font-weight: 600;
}

.refresh-report {
  max-height: 240px;
  margin-bottom: 16px;
  padding: 12px 14px;
  overflow-y: auto;
  background: var(--warning-soft);
  border: 1px solid #fde68a;
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 0.8125rem;
}

.report-group + .report-group {
  margin-top: 10px;
}

.report-group ul {
  margin: 4px 0 0;
  padding-left: 18px;
}

@media (max-width: 720px) {
  .toolbar .toolbar-btn {
    flex: 1 1 100%;
  }

  /* Header rows become sort chips and a filter form above the cards */
  .admin-table thead {
    position: static;
    display: block;
    margin-bottom: 12px;
  }

  .admin-table thead tr {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .admin-table thead th {
    display: block;
    padding: 0;
    background: transparent;
    border: none;
  }

  .admin-table thead th:not(:has(*)) {
    display: none;
  }

  .sort-btn {
    height: 32px;
    padding: 0 12px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    color: var(--text-2);
    font-size: 0.8125rem;
  }

  .sort-btn.active {
    background: var(--primary-soft);
    border-color: #bfdbfe;
    color: var(--primary-text);
  }

  .filter-row {
    margin-top: 6px;
  }

  .filter-row th,
  .filter-row th:first-child {
    flex: 1 1 calc(50% - 3px);
    min-width: 0;
    padding: 0;
  }

  .filter-row th::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 4px;
    color: var(--text-3);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .filter-input,
  .filter-fid,
  .filter-nickname,
  .filter-kingdom,
  .filter-status,
  .filter-daterange {
    width: 100%;
    max-width: none;
    height: 40px;
    font-size: 16px;
  }
}
</style>

<style>
/* Date range picker in the users filter row (the menu is teleported, so not scoped) */
.dp--theme-light {
  --dp-font-family: var(--font-sans);
  --dp-font-size: 0.8125rem;
  --dp-text-color: var(--text);
  --dp-primary-color: var(--primary);
  --dp-primary-text-color: #fff;
  --dp-hover-color: var(--surface-2);
  --dp-border-color: var(--border-strong);
  --dp-border-color-hover: var(--text-4);
  --dp-border-color-focus: var(--primary);
  --dp-range-between-dates-background-color: var(--primary-soft);
  --dp-range-between-dates-text-color: var(--primary-text);
  --dp-range-between-border-color: var(--primary-soft);
  --dp-border-radius: 8px;
  --dp-input-padding: 6px 24px 6px 28px;
  --dp-input-icon-padding: 28px;
}

.filter-daterange .dp--input {
  font-weight: normal;
}

@media (max-width: 720px) {
  .filter-daterange .dp--input {
    height: 40px;
    font-size: 16px;
  }
}
</style>
