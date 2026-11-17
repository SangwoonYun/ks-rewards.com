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
            <td class="check-cell" data-label="Select">
              <input
                type="checkbox"
                :checked="isChecked(user.fid)"
                :disabled="locked"
                @change="toggleOne(user.fid)"
              />
            </td>
            <td data-label="FID">{{ user.fid }}</td>
            <td class="avatar-cell">
              <img
                :src="user.avatar_url || '/images/default-avatar.png'"
                :alt="user.nickname || user.fid"
                class="avatar"
                referrerpolicy="no-referrer"
              />
            </td>
            <td data-label="Nickname">{{ user.nickname || '-' }}</td>
            <td class="kingdom-cell" data-label="Kingdom" title="Double-click to edit" @dblclick="startEdit(user)">
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
            <td class="reason-cell" data-label="Reason">
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
            <td class="nowrap" data-label="Last Failed">{{ formatDate(user.last_failed_at) }}</td>
            <td class="result-cell" data-label="Result">
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
.page-title {
  margin-bottom: 8px;
}

.description {
  margin: 0 0 16px;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-3);
}

.toolbar {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Category tabs (pills) with the search box on the right */
.tabs {
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  border-bottom: none;
  overflow: visible;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-2);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.tab:hover {
  background: var(--surface-2);
}

.tab.active {
  background: var(--text);
  border-color: var(--text);
  color: #fff;
}

.tab-count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.tabs .filter-input {
  width: 200px;
  margin-left: auto;
}

.hint {
  margin: 0 0 12px;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--text-3);
}

.count-info {
  font-size: 0.8125rem;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.bulk-cancel {
  height: 26px;
  margin-left: 8px;
}

.search-summary {
  margin-bottom: 12px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-xs);
  color: var(--text-2);
  font-size: 0.8125rem;
  line-height: 1.6;
}

.progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.progress-track {
  flex: 1;
  height: 8px;
  overflow: hidden;
  background: var(--surface-2);
  border-radius: 999px;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 999px;
  transition: width 0.4s ease;
}

.progress-label {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}

.found-list {
  margin-top: 6px;
  color: var(--success-text);
}

.check-cell {
  width: 40px;
}

.kingdom-cell {
  cursor: pointer;
}

.kingdom-input {
  width: 90px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 0.875rem;
  outline: none;
  box-shadow: var(--ring);
}

.saving {
  font-style: italic;
  color: var(--text-3);
}

.reason-cell {
  max-width: 260px;
}

.reason {
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
}

.reason-wrong_kingdom {
  background: var(--warning-soft);
  color: var(--warning-text);
  box-shadow: inset 0 0 0 1px #fde68a;
}

.reason-no_account {
  background: var(--danger-soft);
  color: var(--danger-text);
  box-shadow: inset 0 0 0 1px #fecaca;
}

.reason-other {
  background: var(--surface-2);
  color: var(--text-3);
  box-shadow: inset 0 0 0 1px var(--border);
}

.result-cell {
  max-width: 240px;
  font-size: 0.8125rem;
}

.search-status {
  font-size: 0.8125rem;
}

.search-queued,
.search-waiting,
.search-cancelled {
  color: var(--text-3);
}

.search-searching {
  color: var(--primary-text);
}

.search-found {
  color: var(--success-text);
  font-weight: 600;
}

.search-not_found,
.search-aborted {
  color: var(--warning-text);
}

.search-no_player {
  color: var(--danger-text);
  font-weight: 600;
}

.nowrap {
  white-space: nowrap;
}

@media (max-width: 720px) {
  /* The search box goes full width below the pills */
  .tabs .filter-input {
    flex-basis: 100%;
    width: 100%;
    margin: 4px 0 0;
  }

  .toolbar-actions {
    width: 100%;
  }

  .toolbar-actions .action-btn {
    flex: 1 1 calc(50% - 3px);
  }

  .progress {
    flex-wrap: wrap;
  }

  .progress-track {
    flex-basis: 100%;
  }

  .progress-label {
    white-space: normal;
  }

  .reason-cell,
  .result-cell {
    max-width: none;
  }

  .reason-cell {
    flex-wrap: wrap;
  }

  .nowrap {
    white-space: normal;
  }

  .kingdom-input {
    height: 34px;
    font-size: 16px;
  }
}
</style>
