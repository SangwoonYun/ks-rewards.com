<template>
  <div class="admin-page">
    <h1 class="page-title">User Management</h1>

    <div class="toolbar">
      <button
        class="action-btn btn-apply-all"
        :disabled="applyingAll"
        @click="applyAllCodes"
      >
        {{ applyingAll ? 'Applying...' : hasFilters ? `Apply Codes (${totalUsers} filtered)` : 'Apply All Codes' }}
      </button>
      <button
        class="action-btn btn-refresh-all"
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
    <div v-else-if="bulkRefreshResult" class="result-banner" :class="bulkRefreshResult.success ? 'result-success' : 'result-error'">
      {{ bulkRefreshResult.message }}
      <button class="dismiss-btn" @click="bulkRefreshResult = null">&times;</button>
    </div>
    <div v-if="!bulkRefresh?.running && bulkRefreshResult?.issues.length" class="refresh-report">
      <div v-for="group in issueGroups" :key="group.reason" class="report-group">
        <strong>{{ group.label }} ({{ group.items.length }})</strong>
        <ul>
          <li v-for="i in group.items" :key="i.fid">
            {{ i.fid }} · {{ i.nickname || '-' }} · K{{ i.kingdom || '?' }}<template v-if="i.reason === 'kingdom_rejected'"> → K{{ i.detail }} rejected</template><template v-else-if="i.detail"> · {{ i.detail }}</template>
          </li>
        </ul>
      </div>
    </div>

    <div v-if="applyAllResult" class="result-banner" :class="applyAllResult.success ? 'result-success' : 'result-error'">
      {{ applyAllResult.message }}
      <button class="dismiss-btn" @click="applyAllResult = null">&times;</button>
    </div>

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
            <th><input v-model="filters.fid" type="text" inputmode="numeric" class="filter-input filter-fid" placeholder="Contains" @input="debouncedFetch" /></th>
            <th></th>
            <th><input v-model="filters.nickname" type="text" class="filter-input filter-nickname" placeholder="Contains" @input="debouncedFetch" /></th>
            <th><input v-model="filters.kingdom" type="text" inputmode="numeric" class="filter-input filter-kingdom" placeholder="Exact" @input="debouncedFetch" /></th>
            <th>
              <select v-model="filters.status" class="filter-input filter-status" @change="fetchUsers">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </th>
            <th>
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
            <td>{{ user.fid }}</td>
            <td class="avatar-cell">
              <img
                :src="user.avatar_url || '/images/default-avatar.png'"
                :alt="user.nickname || user.fid"
                class="avatar"
                referrerpolicy="no-referrer"
              />
            </td>
            <td>{{ user.nickname || '-' }}</td>
            <td>{{ user.kingdom || '-' }}</td>
            <td>
              <span class="badge" :class="user.active ? 'badge-success' : 'badge-danger'">
                {{ user.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td>{{ formatDate(user.created_at) }}</td>
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
import type { User } from '~~/server/utils/db';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

const PAGE_SIZE = 50;

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
const users = ref<User[]>([]);
const loading = ref(true);
const totalUsers = ref(0);
const hasMore = ref(false);
const offset = ref(0);
const sentinelRef = ref<HTMLElement | null>(null);
const tableWrapperRef = ref<HTMLElement | null>(null);
const toggling = ref<string | null>(null);
const applying = ref<string | null>(null);
const applyResults = ref<Record<string, { success: boolean; message: string }>>({});
const applyingAll = ref(false);
const applyAllResult = ref<{ success: boolean; message: string } | null>(null);
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
const bulkRefreshResult = ref<{ success: boolean; message: string; issues: RefreshIssue[] } | null>(null);

// Report of the users that did not refresh cleanly, grouped by reason
const ISSUE_LABELS: Record<RefreshIssue['reason'], string> = {
  deactivated: 'Deactivated (inactive 90 days / last login unknown / no coordinates)',
  not_found: 'Not found on lookup site',
  kingdom_rejected: 'Lookup kingdom rejected by API',
  failed: 'Lookup failed',
};
const issueGroups = computed(() => {
  const issues = bulkRefreshResult.value?.issues ?? [];
  return (Object.keys(ISSUE_LABELS) as RefreshIssue['reason'][])
    .map(reason => ({ reason, label: ISSUE_LABELS[reason], items: issues.filter(i => i.reason === reason) }))
    .filter(g => g.items.length > 0);
});
let bulkPollTimer: ReturnType<typeof setTimeout> | null = null;

function showResult(fid: string, success: boolean, message: string) {
  applyResults.value[fid] = { success, message };
  setTimeout(() => {
    delete applyResults.value[fid];
  }, 5000);
}

async function refreshProfile(user: User) {
  refreshing.value = user.fid;
  delete applyResults.value[user.fid];
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
      message += res.result === 'not_found' ? ', deactivated' : ', deactivated (inactive 90 days / last login unknown / no coordinates)';
      dropPriority(user.fid);
    }
    showResult(user.fid, res.success, message);
  } catch (e) {
    showResult(user.fid, false, 'Failed to refresh profile');
  } finally {
    refreshing.value = null;
  }
}

async function pollBulkRefresh() {
  try {
    const wasRunning = bulkRefresh.value?.running;
    bulkRefresh.value = await $fetch<BulkRefreshStatus>('/api/admin/users/refresh-profiles/status');
    const s = bulkRefresh.value;
    if (s.running) {
      bulkPollTimer = setTimeout(pollBulkRefresh, 2000);
    } else if (wasRunning) {
      bulkRefreshResult.value = {
        success: !s.stoppedReason || s.stoppedReason === 'Cancelled',
        message: `Profiles refreshed: ${s.updated} updated (${s.kingdomUpdated} kingdom changes, ${s.deactivated} deactivated), ${s.notFound} not found, ${s.failed} failed` +
          (s.stoppedReason ? ` (${s.stoppedReason})` : ''),
        issues: s.issues,
      };
      fetchUsers();
      fetchPriorityUsers();
    }
  } catch (e) {
    console.error('Failed to fetch profile refresh status:', e);
  }
}

async function startBulkRefresh() {
  const targets = hasFilters.value ? `the ${totalUsers.value} user(s) matching the filters` : 'every user';
  if (!confirm(`Refresh the nickname, avatar and kingdom of ${targets} from mightpulse.com? Users not found (even by live search), inactive for 90 days, with an unknown last login or without coordinates are deactivated. This runs in the background (about 1.5s per user, up to ~15s more for users that need a live search).`)) return;
  bulkRefreshResult.value = null;
  try {
    bulkRefresh.value = await $fetch<BulkRefreshStatus>('/api/admin/users/refresh-profiles/start', { method: 'POST', body: filterParams() });
    if (bulkRefresh.value.total === 0) {
      bulkRefreshResult.value = { success: true, message: 'No users match the filters', issues: [] };
      return;
    }
    bulkPollTimer = setTimeout(pollBulkRefresh, 2000);
  } catch (e: any) {
    bulkRefreshResult.value = { success: false, message: e?.data?.message || 'Failed to start profile refresh', issues: [] };
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

let debounceTimer: ReturnType<typeof setTimeout>;

function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchUsers, 300);
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

async function fetchUsers() {
  loading.value = true;
  offset.value = 0;
  users.value = [];
  try {
    const params = { limit: String(PAGE_SIZE), offset: '0', ...sortParams(), ...filterParams() };

    const res = await $fetch('/api/admin/users', { params }) as any;
    users.value = res.users;
    totalUsers.value = res.total;
    hasMore.value = res.hasMore;
    offset.value = res.users.length;
  } catch (e) {
    console.error('Failed to fetch users:', e);
  } finally {
    loading.value = false;
  }
}

async function fetchMoreUsers() {
  if (loading.value || !hasMore.value) return;
  loading.value = true;
  try {
    const params = { limit: String(PAGE_SIZE), offset: String(offset.value), ...sortParams(), ...filterParams() };

    const res = await $fetch('/api/admin/users', { params }) as any;
    users.value.push(...res.users);
    totalUsers.value = res.total;
    hasMore.value = res.hasMore;
    offset.value += res.users.length;
  } catch (e) {
    console.error('Failed to fetch more users:', e);
  } finally {
    loading.value = false;
  }
}

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
  delete applyResults.value[user.fid];
  try {
    const res = await $fetch(`/api/admin/users/${user.fid}/apply-codes`, { method: 'POST' }) as any;
    applyResults.value[user.fid] = {
      success: res.success,
      message: res.queuedCount === 0
        ? 'No codes to apply'
        : `${res.redeemedCount}/${res.queuedCount} applied`,
    };
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      delete applyResults.value[user.fid];
    }, 5000);
  } catch (e: any) {
    applyResults.value[user.fid] = {
      success: false,
      message: 'Failed to apply codes',
    };
  } finally {
    applying.value = null;
  }
}

async function applyAllCodes() {
  const targets = hasFilters.value ? `the active users among the ${totalUsers.value} matching the filters` : 'all active users';
  if (!confirm(`Apply all validated gift codes to ${targets}? This may take a while.`)) return;

  applyingAll.value = true;
  applyAllResult.value = null;
  try {
    const res = await $fetch('/api/admin/users/apply-all', { method: 'POST', body: filterParams() }) as any;
    const scope = res.targetCount === null ? '' : `${res.targetCount} filtered active user(s): `;
    applyAllResult.value = {
      success: res.success,
      message: scope + (res.queuedCount === 0
        ? 'No unredeemed codes to apply'
        : `Queued ${res.queuedCount}, processed ${res.processed} (${res.successCount} success, ${res.failedCount} failed)`),
    };
  } catch (e: any) {
    applyAllResult.value = {
      success: false,
      message: 'Failed to apply codes for all users',
    };
  } finally {
    applyingAll.value = false;
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString();
}

let observer: IntersectionObserver | null = null;

watch(sentinelRef, (el) => {
  if (observer) observer.disconnect();
  if (!el || !tableWrapperRef.value) return;
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) fetchMoreUsers();
  }, { root: tableWrapperRef.value, threshold: 0 });
  observer.observe(el);
});

onMounted(() => {
  fetchUsers();
  fetchPriorityUsers();
  // Picks up a refresh that is already running (e.g. after a page reload)
  pollBulkRefresh();
});

onUnmounted(() => {
  observer?.disconnect();
  if (bulkPollTimer) clearTimeout(bulkPollTimer);
});
</script>

<style scoped>
.admin-page {
  font-family: 'Cinzel', serif;
  color: #5C4A35;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.page-title {
  font-size: 1.6rem;
  color: #6b472c;
  margin: 0 0 24px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  color: inherit;
  cursor: pointer;
}

.sort-btn:hover,
.sort-btn.active {
  color: #5C4A35;
}

.sort-icon {
  font-size: 0.7rem;
  opacity: 0.5;
}

.sort-btn.active .sort-icon {
  opacity: 1;
}

.filter-row th {
  padding: 6px 8px 10px;
  text-transform: none;
  letter-spacing: normal;
}

.filter-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid rgba(92, 74, 53, 0.2);
  border-radius: 6px;
  font-family: system-ui, sans-serif;
  font-size: 0.8rem;
  color: #5C4A35;
  background: #fff;
}

.filter-input:focus {
  outline: none;
  border-color: #D4A574;
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15);
}

.filter-fid {
  max-width: 90px;
}

.filter-nickname {
  max-width: 110px;
}

.filter-kingdom {
  max-width: 60px;
}

.filter-status {
  max-width: 90px;
}

.filter-daterange {
  width: 165px;
}

.info-bar {
  font-size: 0.8rem;
  color: #8B7355;
  margin-bottom: 12px;
}

.table-wrapper {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(92, 74, 53, 0.08);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.admin-table th {
  background: #FFF8EF;
  padding: 12px 16px;
  text-align: left;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #8B7355;
  border-bottom: 1px solid rgba(92, 74, 53, 0.08);
}

/* Both header rows (titles and filters) stay on top while scrolling */
.admin-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.admin-table td {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(92, 74, 53, 0.05);
}

.admin-table tbody tr:hover {
  background: rgba(245, 230, 211, 0.3);
}

.empty {
  text-align: center;
  color: #8B7355;
  padding: 24px !important;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #8B7355;
}

.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.badge-success {
  background: rgba(107, 142, 35, 0.12);
  color: #6B8E23;
}

.badge-danger {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.actions-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-deactivate {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.btn-deactivate:hover:not(:disabled) {
  background: rgba(224, 106, 106, 0.25);
}

.btn-activate {
  background: rgba(107, 142, 35, 0.12);
  color: #6B8E23;
}

.btn-activate:hover:not(:disabled) {
  background: rgba(107, 142, 35, 0.25);
}

.btn-apply {
  background: rgba(70, 130, 180, 0.12);
  color: #4682B4;
}

.btn-apply:hover:not(:disabled) {
  background: rgba(70, 130, 180, 0.25);
}

.btn-priority-add {
  background: rgba(138, 43, 226, 0.12);
  color: #8A2BE2;
}

.btn-priority-add:hover:not(:disabled) {
  background: rgba(138, 43, 226, 0.25);
}

.btn-priority-remove {
  background: rgba(138, 43, 226, 0.25);
  color: #8A2BE2;
}

.btn-priority-remove:hover:not(:disabled) {
  background: rgba(138, 43, 226, 0.12);
}

.btn-apply-all {
  background: rgba(70, 130, 180, 0.15);
  color: #4682B4;
  padding: 10px 18px;
  font-size: 0.85rem;
}

.btn-apply-all:hover:not(:disabled) {
  background: rgba(70, 130, 180, 0.3);
}

.btn-refresh {
  background: rgba(184, 134, 11, 0.12);
  color: #B8860B;
}

.btn-refresh:hover:not(:disabled) {
  background: rgba(184, 134, 11, 0.25);
}

.btn-refresh-all {
  background: rgba(184, 134, 11, 0.15);
  color: #B8860B;
  padding: 10px 18px;
  font-size: 0.85rem;
}

.btn-refresh-all:hover:not(:disabled) {
  background: rgba(184, 134, 11, 0.3);
}

.apply-result {
  font-size: 0.7rem;
  font-weight: 600;
}

.text-success {
  color: #6B8E23;
}

.text-error {
  color: #E06A6A;
}

.result-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.85rem;
  font-weight: 600;
}

.result-success {
  background: rgba(107, 142, 35, 0.12);
  color: #6B8E23;
}

.result-error {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.refresh-report {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(212, 165, 116, 0.12);
  font-size: 0.8rem;
  max-height: 240px;
  overflow-y: auto;
}

.report-group + .report-group {
  margin-top: 10px;
}

.report-group ul {
  margin: 4px 0 0;
  padding-left: 18px;
}

.result-info {
  background: rgba(184, 134, 11, 0.12);
  color: #B8860B;
}

.dismiss-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: inherit;
  padding: 0 4px;
  line-height: 1;
}

.sentinel-cell {
  padding: 0 !important;
}

.sentinel {
  height: 1px;
}

.avatar-cell {
  padding: 6px 8px !important;
  width: 36px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
</style>

<style>
/* Date range picker in the users filter row, in the admin palette (the menu is teleported, so not scoped) */
.dp--theme-light {
  --dp-font-family: system-ui, sans-serif;
  --dp-font-size: 0.8rem;
  --dp-text-color: #5C4A35;
  --dp-primary-color: #D4A574;
  --dp-primary-text-color: #fff;
  --dp-hover-color: #F5E6D3;
  --dp-border-color: rgba(92, 74, 53, 0.2);
  --dp-border-color-hover: #D4A574;
  --dp-border-color-focus: #D4A574;
  --dp-range-between-dates-background-color: #F5E6D3;
  --dp-range-between-dates-text-color: #5C4A35;
  --dp-range-between-border-color: #F5E6D3;
  --dp-border-radius: 6px;
  --dp-input-padding: 5px 24px 5px 26px;
  --dp-input-icon-padding: 26px;
}

.filter-daterange .dp--input {
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
}
</style>
