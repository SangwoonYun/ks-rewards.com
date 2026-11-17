<template>
  <div class="admin-page">
    <h1 class="page-title">Redemption Failures</h1>

    <p class="description">
      리트라이를 모두 소진하고도 실패한 코드가 있는 활성 유저입니다. 코드 만료/무효, 수령 조건 미달은 실패로 보지 않습니다.
      원인이 해결되면(왕국 확인, 재시도 성공, 비활성화) 목록에서 자동으로 빠집니다.
    </p>

    <div v-if="result" class="result-banner" :class="result.success ? 'result-success' : 'result-error'">
      {{ result.message }}
      <button class="dismiss-btn" @click="result = null">&times;</button>
    </div>

    <div class="tabs">
      <button
        v-for="tab in CATEGORY_TABS"
        :key="tab.key"
        class="tab"
        :class="{ active: category === tab.key }"
        @click="category = tab.key"
      >
        {{ tab.label }} <span class="tab-count">{{ categoryCounts[tab.key] }}</span>
      </button>
      <input v-model="query" type="text" class="filter-input" placeholder="FID / nickname" />
    </div>
    <p class="hint">{{ CATEGORY_HINTS[category] }}</p>

    <div class="toolbar">
      <span class="count-info">{{ visibleUsers.length }} users · {{ selectedUsers.length }} selected</span>
      <div class="toolbar-actions">
        <template v-if="!search.running">
          <button
            class="action-btn btn-primary"
            :disabled="selectedWrongKingdom.length === 0 || busy"
            title="Only users with a wrong kingdom"
            @click="startSearch"
          >
            Auto-detect Kingdom ({{ selectedWrongKingdom.length }})
          </button>
        </template>
        <button
          v-else
          class="action-btn btn-danger"
          :disabled="search.cancelRequested"
          @click="cancelSearch"
        >
          {{ search.cancelRequested ? 'Cancelling...' : 'Cancel Search' }}
        </button>
        <button class="action-btn btn-refresh" :disabled="selectedUsers.length === 0 || busy" @click="runBulk('refresh')">
          Refresh Profile ({{ selectedUsers.length }})
        </button>
        <button class="action-btn btn-apply" :disabled="selectedUsers.length === 0 || busy" @click="runBulk('retry')">
          Retry Codes ({{ selectedUsers.length }})
        </button>
        <button class="action-btn btn-deactivate" :disabled="selectedUsers.length === 0 || busy" @click="runBulk('deactivate')">
          Deactivate ({{ selectedUsers.length }})
        </button>
        <button class="action-btn btn-secondary" :disabled="loading" @click="fetchUsers">
          {{ loading ? 'Loading...' : 'Reload' }}
        </button>
      </div>
    </div>

    <div v-if="bulk" class="search-summary">
      {{ ACTION_LABELS[bulk.action] }}: {{ bulk.done }} / {{ bulk.fids.length }}
      ({{ bulk.ok }} ok, {{ bulk.failed }} failed)
      <button class="action-btn btn-danger bulk-cancel" :disabled="bulk.cancel" @click="bulk.cancel = true">
        {{ bulk.cancel ? 'Stopping...' : 'Stop' }}
      </button>
    </div>

    <div v-if="search.users.length" class="search-summary">
      <template v-if="search.running">
        Searching {{ searchCounts.active }} user(s) ({{ searchCounts.waiting }} waiting for scouts)
        · groups {{ groupCounts.done }} done, {{ groupCounts.running }} running / {{ groupCounts.total }}
          (started to keep {{ search.targetSenders }} users sending)
        · {{ (search.intervalMs / 1000).toFixed(1) }}s/request<template v-if="search.intervalMs > search.baseIntervalMs"> (slowed down from {{ (search.baseIntervalMs / 1000).toFixed(1) }}s<template v-if="search.last429IntervalMs">, HTTP 429 at {{ (search.last429IntervalMs / 1000).toFixed(1) }}s</template>)</template>
        <template v-if="search.pausedUntil && search.pausedUntil > now"> · paused {{ Math.ceil((search.pausedUntil - now) / 1000) }}s (HTTP 429)</template>
        · worst case ~{{ worstCaseMinutes }} min left
      </template>
      <template v-else>Last kingdom search finished</template>
      · found {{ searchCounts.found }} ({{ searchCounts.foundViaLookup }} via lookup, {{ searchCounts.foundViaGroup }} via group) · not found {{ searchCounts.not_found }}
      · no account {{ searchCounts.no_player }} · aborted {{ searchCounts.aborted }}
      · cancelled {{ searchCounts.cancelled }}
      <div class="progress">
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuenow="progressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
        <span class="progress-label">
          {{ progressPercent.toFixed(1) }}%
          · requests {{ progressRequests.processed.toLocaleString() }} / {{ progressRequests.total.toLocaleString() }} (worst case)
          · sent {{ progressRequests.sent.toLocaleString() }}
          · users {{ progressUsersDone }} / {{ search.users.length }}
        </span>
      </div>
      <div v-if="foundSummary.length" class="found-list">
        Confirmed (removed from list): {{ foundSummary.join(', ') }}
      </div>
    </div>

    <div class="table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th class="check-cell">
              <input
                type="checkbox"
                :checked="allChecked"
                :indeterminate="someChecked"
                :disabled="locked || visibleUsers.length === 0"
                @change="toggleAll"
              />
            </th>
            <th>FID</th>
            <th></th>
            <th>Nickname</th>
            <th>Kingdom</th>
            <th>Reason</th>
            <th>Last Failed</th>
            <th>Result</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in visibleUsers" :key="user.fid">
            <td class="check-cell">
              <input
                type="checkbox"
                :checked="isChecked(user.fid)"
                :disabled="locked"
                @change="toggleOne(user.fid)"
              />
            </td>
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
            <td class="kingdom-cell" title="Double-click to edit" @dblclick="startEdit(user)">
              <span v-if="saving === user.fid" class="saving">Verifying...</span>
              <input
                v-else-if="editing === user.fid"
                ref="editInputRef"
                v-model="editValue"
                type="text"
                inputmode="numeric"
                class="kingdom-input"
                @keyup.enter="saveEdit(user)"
                @keyup.esc="cancelEdit"
                @blur="cancelEdit"
              />
              <span v-else>{{ user.kingdom || '-' }}</span>
            </td>
            <td class="reason-cell">
              <span
                v-for="f in user.failures"
                :key="f.status"
                class="reason"
                :class="`reason-${statusCategory(f.status)}`"
                :title="f.codes.join(', ')"
              >
                {{ STATUS_LABELS[f.status] ?? f.status }} ×{{ f.codes.length }}
              </span>
            </td>
            <td class="nowrap">{{ formatDate(user.last_failed_at) }}</td>
            <td class="result-cell">
              <span v-if="searchByFid[user.fid]" class="search-status" :class="`search-${searchByFid[user.fid]!.status}`">
                {{ searchLabel(searchByFid[user.fid]!) }}
              </span>
              <span v-else-if="working === user.fid" class="muted">Working...</span>
              <span v-else-if="rowResults[user.fid]" :class="rowResults[user.fid]!.success ? 'text-success' : 'text-error'">
                {{ rowResults[user.fid]!.message }}
              </span>
              <span v-else class="muted">-</span>
            </td>
            <td class="actions-cell">
              <button class="action-btn btn-refresh" :disabled="busy" title="Nickname, avatar and kingdom from the lookup site" @click="runOne('refresh', user)">Refresh</button>
              <button class="action-btn btn-apply" :disabled="busy" title="Redeem the unredeemed codes now" @click="runOne('retry', user)">Retry</button>
              <button class="action-btn btn-deactivate" :disabled="busy" @click="runOne('deactivate', user)">Deactivate</button>
            </td>
          </tr>
          <tr v-if="!loading && visibleUsers.length === 0">
            <td colspan="9" class="empty">No redemption failures</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserSearch } from '~~/server/services/kingdomSearch';
import type { FailureCategory, FailureUser } from '~~/server/api/admin/users/redemption-failures.get';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

interface SearchState {
  running: boolean;
  cancelRequested: boolean;
  intervalMs: number;
  baseIntervalMs: number;
  last429IntervalMs: number | null;
  pausedUntil: number | null;
  backoffs: number;
  perFidIntervalMs: number;
  activeGroups: number;
  targetSenders: number;
  users: UserSearch[];
}

type Action = 'refresh' | 'retry' | 'deactivate';
interface ActionResult { success: boolean; message: string; deactivated?: boolean }

const POLL_INTERVAL_MS = 2000;
// Pause between users in a bulk action (same pace as the bulk profile refresh)
const BULK_INTERVAL_MS = 1500;

const CATEGORY_TABS: { key: 'all' | FailureCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'wrong_kingdom', label: 'Wrong Kingdom' },
  { key: 'no_account', label: 'Account Not Found' },
  { key: 'other', label: 'Other Errors' },
];
const CATEGORY_HINTS: Record<'all' | FailureCategory, string> = {
  all: '유저별로 가장 심각한 원인 기준으로 분류됩니다: 왕국 불일치 > 계정 없음 > 기타.',
  wrong_kingdom: '왕국을 이동한 유저입니다. Refresh로 조회 사이트의 왕국을 확인하거나, Kingdom 칸 더블클릭으로 직접 수정하거나, Auto-detect로 ±500 범위를 탐색하세요. 왕국이 확인되면 실패한 코드를 바로 다시 수령합니다.',
  no_account: '공식 API가 계정이 없다고 응답한 유저입니다(삭제된 계정 또는 잘못된 FID). Refresh로 확인하고, 계정이 없으면 Deactivate 하세요.',
  other: '타임아웃·요청 제한 등으로 리트라이를 모두 실패한 유저입니다. 대부분 일시적인 문제라 Retry로 다시 수령하면 해결됩니다.',
};
const ACTION_LABELS: Record<Action, string> = {
  refresh: 'Refresh profile',
  retry: 'Retry codes',
  deactivate: 'Deactivate',
};
const STATUS_LABELS: Record<string, string> = {
  USER_INFO_ERROR: 'Wrong kingdom',
  ROLE_NOT_EXIST: 'Account not found',
  TIMEOUT_RETRY: 'Timeout',
  TOO_FREQUENT: 'Rate limited',
  NOT_LOGIN: 'Not logged in',
  SIGN_ERROR: 'Sign error',
};

const users = ref<FailureUser[]>([]);
const loading = ref(true);
const category = ref<'all' | FailureCategory>('all');
const query = ref('');
const editing = ref<string | null>(null);
const editValue = ref('');
const editInputRef = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
const saving = ref<string | null>(null);
const working = ref<string | null>(null);
const rowResults = ref<Record<string, ActionResult>>({});
const result = ref<ActionResult | null>(null);
const selected = ref<Set<string>>(new Set());
const bulk = ref<{ action: Action; fids: string[]; done: number; ok: number; failed: number; cancel: boolean } | null>(null);
const search = ref<SearchState>({ running: false, cancelRequested: false, intervalMs: 0, baseIntervalMs: 0, last429IntervalMs: null, pausedUntil: null, backoffs: 0, perFidIntervalMs: 0, activeGroups: 0, targetSenders: 0, users: [] });
const now = ref(Date.now());
let pollTimer: ReturnType<typeof setTimeout> | null = null;

// One action at a time (row or bulk); the kingdom search also locks the selection
const busy = computed(() => !!bulk.value || !!working.value);
const locked = computed(() => search.value.running || busy.value);

const statusCategory = (status: string): FailureCategory =>
  status === 'USER_INFO_ERROR' ? 'wrong_kingdom' : status === 'ROLE_NOT_EXIST' ? 'no_account' : 'other';

const categoryCounts = computed(() => {
  const counts: Record<'all' | FailureCategory, number> = { all: users.value.length, wrong_kingdom: 0, no_account: 0, other: 0 };
  for (const u of users.value) counts[u.category]++;
  return counts;
});

const visibleUsers = computed(() => {
  const q = query.value.trim().toLowerCase();
  return users.value.filter(u =>
    (category.value === 'all' || u.category === category.value) &&
    (!q || u.fid.includes(q) || u.nickname?.toLowerCase().includes(q)));
});

const searchByFid = computed(() => Object.fromEntries(search.value.users.map(u => [u.fid, u])) as Record<string, UserSearch>);

// While a search runs the checkboxes show its targets; otherwise the selection among the visible rows
const isChecked = (fid: string) => search.value.running ? fid in searchByFid.value : selected.value.has(fid);
const allChecked = computed(() => visibleUsers.value.length > 0 && visibleUsers.value.every(u => isChecked(u.fid)));
const someChecked = computed(() => visibleUsers.value.some(u => isChecked(u.fid)) && !allChecked.value);
// Actions only apply to selected users that are visible (the tab or filter may hide some)
const selectedUsers = computed(() => search.value.running ? [] : visibleUsers.value.filter(u => selected.value.has(u.fid)));
const selectedWrongKingdom = computed(() => selectedUsers.value.filter(u => u.category === 'wrong_kingdom'));

const isSearchActive = (u: UserSearch) => u.status === 'queued' || u.status === 'waiting' || u.status === 'searching';

const searchCounts = computed(() => {
  const counts = { active: 0, waiting: 0, found: 0, foundViaLookup: 0, foundViaGroup: 0, not_found: 0, no_player: 0, aborted: 0, cancelled: 0 };
  for (const u of search.value.users) {
    if (isSearchActive(u)) {
      counts.active++;
      if (u.status === 'waiting') counts.waiting++;
    } else {
      counts[u.status as 'found' | 'not_found' | 'no_player' | 'aborted' | 'cancelled']++;
      if (u.status === 'found' && u.foundViaGroup) counts.foundViaGroup++;
      if (u.status === 'found' && u.foundViaLookup) counts.foundViaLookup++;
    }
  }
  return counts;
});

// Groups = users sharing an original kingdom; started as needed to keep targetSenders users sending
const groupCounts = computed(() => {
  const all = new Set<string>();
  const unfinished = new Set<string>();
  const running = new Set<string>();
  for (const u of search.value.users) {
    if (!u.originalKingdom) continue;
    all.add(u.originalKingdom);
    if (isSearchActive(u)) {
      unfinished.add(u.originalKingdom);
      if (u.groupActive) running.add(u.originalKingdom);
    }
  }
  return { total: all.size, done: all.size - unfinished.size, running: running.size };
});

// Progress by requests against the worst case of every user:
//   total     = sum of every user's maximum requests (±500 range), fixed for the whole search
//   processed = requests sent by unfinished users + the full maximum of finished users
//               (a user done after 3 of 620 counts as 620: the rest will never be needed)
const progressRequests = computed(() => {
  let processed = 0;
  let total = 0;
  let sent = 0;
  for (const u of search.value.users) {
    total += u.total;
    sent += u.tried;
    processed += isSearchActive(u) ? u.tried : u.total;
  }
  return { processed, total, sent };
});
const progressUsersDone = computed(() => search.value.users.length - searchCounts.value.active);
const progressPercent = computed(() => {
  const { processed, total } = progressRequests.value;
  const percent = total === 0 ? 100 : (processed / total) * 100;
  // Never show 100.0% while someone is still being searched
  return searchCounts.value.active > 0 ? Math.min(percent, 99.9) : percent;
});

// Every remaining request, bounded by the shared interval (all users) and the per-FID interval (slowest user)
// Excludes TOO_FREQUENT cooldowns; an upper bound since waiting users usually finish on a group hint
const worstCaseMinutes = computed(() => {
  const remaining = search.value.users
    .filter(isSearchActive)
    .map(u => u.total - u.tried);
  const total = remaining.reduce((sum, n) => sum + n, 0);
  const longest = Math.max(0, ...remaining);
  const ms = Math.max(total * search.value.intervalMs, longest * search.value.perFidIntervalMs);
  return Math.ceil(ms / 60000);
});

function toggleAll() {
  const next = new Set(selected.value);
  const check = !allChecked.value;
  for (const u of visibleUsers.value) {
    if (check) next.add(u.fid);
    else next.delete(u.fid);
  }
  selected.value = next;
}

function toggleOne(fid: string) {
  const next = new Set(selected.value);
  if (next.has(fid)) next.delete(fid);
  else next.add(fid);
  selected.value = next;
}

function searchLabel(u: UserSearch) {
  switch (u.status) {
    case 'queued':
      return u.groupActive ? 'Queued' : `Queued (group K${u.originalKingdom} not started)`;
    case 'waiting':
      return `Waiting for group scouts (K${u.originalKingdom}, ${u.tried} tried)`;
    case 'searching':
      if (u.cooldownUntil && u.cooldownUntil > now.value) {
        return `Rate limited, retrying K${u.currentKingdom} in ${Math.ceil((u.cooldownUntil - now.value) / 1000)}s`;
      }
      return `Searching K${u.currentKingdom} (${u.tried}/${u.total})`;
    case 'found': {
      const head = u.foundKingdom === u.originalKingdom
        ? 'Current kingdom OK'
        : `Found → ${u.foundKingdom}${u.foundViaGroup ? ' (group)' : u.foundViaLookup ? ' (lookup)' : ''}`;
      return u.redeemedCount === null ? `${head} · redeeming...` : `${head} · ${u.redeemedCount} code(s) redeemed`;
    }
    case 'not_found':
      return `Not found (±500, ${u.tried} tried)`;
    case 'no_player':
      return 'Account not found (ROLE_NOT_EXIST)';
    case 'aborted':
      return `Aborted: ${u.message}`;
    case 'cancelled':
      return `Cancelled (${u.tried}/${u.total})`;
  }
}

async function fetchUsers() {
  loading.value = true;
  try {
    const res = await $fetch<{ users: FailureUser[] }>('/api/admin/users/redemption-failures');
    users.value = res.users;
    // Drop selections and results for users no longer listed
    const listed = new Set(users.value.map(u => u.fid));
    selected.value = new Set([...selected.value].filter(fid => listed.has(fid)));
    rowResults.value = Object.fromEntries(Object.entries(rowResults.value).filter(([fid]) => listed.has(fid)));
  } catch (e) {
    console.error('Failed to fetch redemption failures:', e);
  } finally {
    loading.value = false;
  }
}

// "fid: old → new" for every user the search confirmed (they drop off the list once confirmed)
const foundSummary = computed(() => search.value.users
  .filter(u => u.status === 'found')
  .map(u => u.foundKingdom === u.originalKingdom
    ? `${u.fid}: ${u.foundKingdom} (current OK)`
    : `${u.fid}: ${u.originalKingdom} → ${u.foundKingdom}`));

async function fetchSearchStatus() {
  try {
    const wasRunning = search.value.running;
    const prevFound = searchCounts.value.found;
    search.value = await $fetch<SearchState>('/api/admin/kingdom-search/status');
    now.value = Date.now();

    // Confirmed users are removed from the list
    if (searchCounts.value.found > prevFound) {
      await fetchUsers();
    }

    if (wasRunning && !search.value.running) {
      const c = searchCounts.value;
      result.value = {
        success: true,
        message: `Kingdom search finished: found ${c.found}, not found ${c.not_found}, no account ${c.no_player}, aborted ${c.aborted}, cancelled ${c.cancelled}.`
      };
      await fetchUsers();
    }
  } catch (e) {
    console.error('Failed to fetch kingdom search status:', e);
  }

  if (search.value.running) {
    pollTimer = setTimeout(fetchSearchStatus, POLL_INTERVAL_MS);
  }
}

async function startSearch() {
  const fids = selectedWrongKingdom.value.map(u => u.fid);
  if (!confirm(`Search kingdoms for ${fids.length} user(s)? This sends up to ~1000 requests per user.`)) return;

  try {
    search.value = await $fetch<SearchState>('/api/admin/kingdom-search/start', {
      method: 'POST',
      body: { fids }
    });
    result.value = null;
    selected.value = new Set();
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(fetchSearchStatus, POLL_INTERVAL_MS);
  } catch (e: any) {
    result.value = { success: false, message: e?.data?.message || e?.message || 'Failed to start search' };
  }
}

async function cancelSearch() {
  try {
    search.value = await $fetch<SearchState>('/api/admin/kingdom-search/cancel', { method: 'POST' });
  } catch (e: any) {
    result.value = { success: false, message: e?.data?.message || e?.message || 'Failed to cancel search' };
  }
}

// Row and bulk actions; each returns a short result for the Result column
async function performAction(action: Action, user: FailureUser): Promise<ActionResult> {
  try {
    if (action === 'refresh') {
      const res = await $fetch(`/api/admin/users/${user.fid}/refresh-profile`, { method: 'POST' }) as any;
      const messages: Record<string, string> = { updated: 'Profile updated', not_found: 'Not found on lookup site', failed: 'Lookup failed' };
      let message = messages[res.result] ?? res.result;
      if (res.kingdom?.status === 'updated') message += `, kingdom ${res.kingdom.from} → ${res.kingdom.to}`;
      if (res.kingdom?.status === 'rejected') message += `, kingdom ${res.kingdom.to} rejected by API`;
      if (res.result === 'updated' && !res.kingdom && user.category === 'wrong_kingdom') message += ', same kingdom as on record';
      if (res.deactivated) message += res.result === 'not_found' ? ', deactivated' : ', deactivated (inactive)';
      return { success: res.result === 'updated' && res.kingdom?.status !== 'rejected', message, deactivated: !!res.deactivated };
    }
    if (action === 'retry') {
      const res = await $fetch(`/api/admin/users/${user.fid}/apply-codes`, { method: 'POST' }) as any;
      return {
        success: res.queuedCount === 0 || res.redeemedCount > 0,
        message: res.queuedCount === 0 ? 'No codes to retry' : `Redeemed ${res.redeemedCount}/${res.queuedCount}`,
      };
    }
    // Everyone listed is active, so the toggle deactivates
    await $fetch(`/api/admin/users/${user.fid}/toggle`, { method: 'POST' });
    return { success: true, message: 'Deactivated', deactivated: true };
  } catch (e: any) {
    return { success: false, message: e?.data?.message || e?.message || 'Request failed' };
  }
}

function removeUser(fid: string) {
  users.value = users.value.filter(u => u.fid !== fid);
  if (selected.value.has(fid)) {
    const next = new Set(selected.value);
    next.delete(fid);
    selected.value = next;
  }
}

async function runOne(action: Action, user: FailureUser) {
  if (action === 'deactivate' && !confirm(`Deactivate ${user.fid}${user.nickname ? ` (${user.nickname})` : ''}?`)) return;
  working.value = user.fid;
  const res = await performAction(action, user);
  working.value = null;
  rowResults.value[user.fid] = res;
  // The row may drop off the list once fixed, so the banner keeps the outcome
  result.value = { success: res.success, message: `${user.fid}: ${res.message}` };
  await fetchUsers();
}

async function runBulk(action: Action) {
  const targets = selectedUsers.value;
  const confirmText: Record<Action, string> = {
    refresh: `Refresh the profile (nickname, avatar, kingdom) of ${targets.length} user(s)? Users not found or inactive are deactivated.`,
    retry: `Retry the unredeemed codes of ${targets.length} user(s) now?`,
    deactivate: `Deactivate ${targets.length} user(s)? They also leave the priority queue.`,
  };
  if (!confirm(confirmText[action])) return;

  bulk.value = { action, fids: targets.map(u => u.fid), done: 0, ok: 0, failed: 0, cancel: false };
  result.value = null;
  for (const user of targets) {
    if (bulk.value.cancel) break;
    working.value = user.fid;
    const res = await performAction(action, user);
    working.value = null;
    rowResults.value[user.fid] = res;
    // Only active users are listed: drop a deactivated user now instead of after the whole run
    if (res.deactivated) removeUser(user.fid);
    bulk.value.done++;
    if (res.success) bulk.value.ok++;
    else bulk.value.failed++;
    if (action !== 'deactivate' && bulk.value.done < targets.length) {
      await new Promise(resolve => setTimeout(resolve, BULK_INTERVAL_MS));
    }
  }

  const b = bulk.value;
  bulk.value = null;
  result.value = {
    success: b.failed === 0,
    message: `${ACTION_LABELS[action]}: ${b.ok} ok, ${b.failed} failed` +
      (b.done < b.fids.length ? ` (stopped after ${b.done}/${b.fids.length})` : '') +
      '. Fixed users were removed from the list.',
  };
  selected.value = new Set();
  await fetchUsers();
}

async function startEdit(user: FailureUser) {
  if (saving.value || search.value.running || busy.value) return;
  editing.value = user.fid;
  editValue.value = user.kingdom || '';
  await nextTick();
  const input = Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value;
  input?.focus();
  input?.select();
}

function cancelEdit() {
  editing.value = null;
}

async function saveEdit(user: FailureUser) {
  const kid = editValue.value.trim();
  editing.value = null;

  if (kid === (user.kingdom || '')) return;
  if (!/^\d+$/.test(kid)) {
    result.value = { success: false, message: `${user.fid}: Kingdom number must be numeric` };
    return;
  }

  saving.value = user.fid;
  try {
    const res = await $fetch(`/api/admin/users/${user.fid}/kingdom`, {
      method: 'POST',
      body: { kid }
    }) as any;

    if (res.success) {
      result.value = { success: true, message: `${user.fid}: ${user.kingdom || '-'} → ${kid}. ${res.message}` };
      await fetchUsers();
    } else {
      // Nothing was saved: the cell keeps showing the original kingdom
      result.value = { success: false, message: `${user.fid}: ${kid} rejected - ${res.message}` };
    }
  } catch (e: any) {
    result.value = { success: false, message: `${user.fid}: ${e?.data?.message || e?.message || 'Request failed'}` };
  } finally {
    saving.value = null;
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleString();
}

onMounted(() => {
  fetchUsers();
  fetchSearchStatus();
});

onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
  if (bulk.value) bulk.value.cancel = true;
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
  margin: 0 0 12px;
}

.description {
  font-size: 0.85rem;
  color: #8B7355;
  margin: 0 0 16px;
  line-height: 1.5;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.tab {
  padding: 6px 12px;
  border: 1px solid rgba(92, 74, 53, 0.15);
  border-radius: 16px;
  background: #FFF8EF;
  font-family: inherit;
  font-size: 0.8rem;
  color: #8B7355;
  cursor: pointer;
}

.tab.active {
  background: #6b472c;
  border-color: #6b472c;
  color: #fff;
}

.tab-count {
  font-family: system-ui, sans-serif;
  font-weight: 700;
  margin-left: 2px;
}

.filter-input {
  margin-left: auto;
  width: 180px;
  padding: 6px 10px;
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

.hint {
  font-size: 0.8rem;
  color: #8B7355;
  margin: 0 0 12px;
  font-family: system-ui, sans-serif;
}

.bulk-cancel {
  margin-left: 8px;
  padding: 3px 10px;
}

.count-info {
  font-size: 0.8rem;
  color: #8B7355;
}

.search-summary {
  font-size: 0.8rem;
  color: #6b472c;
  background: #FFF8EF;
  border: 1px solid rgba(92, 74, 53, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
}

.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.progress-track {
  flex: 1;
  height: 10px;
  background: rgba(92, 74, 53, 0.1);
  border-radius: 5px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #D4A574 0%, #6B8E23 100%);
  border-radius: 5px;
  transition: width 0.4s ease;
}

.progress-label {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.found-list {
  margin-top: 4px;
  color: #6B8E23;
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

.check-cell {
  width: 32px;
}

.empty {
  text-align: center;
  color: #8B7355;
  padding: 24px !important;
}

.muted {
  color: #B8A68E;
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

.search-status {
  font-size: 0.8rem;
}

.search-queued,
.search-waiting,
.search-cancelled {
  color: #8B7355;
}

.search-searching {
  color: #B07D3E;
}

.search-found {
  color: #6B8E23;
  font-weight: 700;
}

.search-not_found,
.search-aborted {
  color: #C0843A;
}

.search-no_player {
  color: #E06A6A;
  font-weight: 700;
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
}

.btn-primary {
  background: #6b472c;
  color: #fff;
}

.btn-secondary {
  background: #D4A574;
  color: #fff;
}

.btn-refresh {
  background: rgba(184, 134, 11, 0.12);
  color: #B8860B;
}

.btn-refresh:hover:not(:disabled) {
  background: rgba(184, 134, 11, 0.25);
}

.btn-apply {
  background: rgba(70, 130, 180, 0.12);
  color: #4682B4;
}

.btn-apply:hover:not(:disabled) {
  background: rgba(70, 130, 180, 0.25);
}

.btn-danger {
  background: #E06A6A;
  color: #fff;
}

.kingdom-cell {
  cursor: pointer;
}

.kingdom-input {
  width: 90px;
  padding: 4px 8px;
  border: 1px solid #D4A574;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.9rem;
  color: #5C4A35;
  background: #FFF8EF;
}

.kingdom-input:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15);
}

.saving {
  color: #8B7355;
  font-style: italic;
}

.result-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.85rem;
}

.result-success {
  background: rgba(107, 142, 35, 0.12);
  color: #6B8E23;
}

.result-error {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.dismiss-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: inherit;
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.reason-cell {
  max-width: 260px;
}

.reason {
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 2px 8px;
  border-radius: 10px;
  font-family: system-ui, sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
}

.reason-wrong_kingdom {
  background: rgba(192, 132, 58, 0.15);
  color: #A0652A;
}

.reason-no_account {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.reason-other {
  background: rgba(92, 74, 53, 0.08);
  color: #8B7355;
}

.result-cell {
  font-size: 0.8rem;
  max-width: 240px;
}

.text-success {
  color: #6B8E23;
}

.text-error {
  color: #E06A6A;
}

.nowrap {
  white-space: nowrap;
}

.actions-cell {
  white-space: nowrap;
}

.actions-cell .action-btn + .action-btn {
  margin-left: 4px;
}
</style>
