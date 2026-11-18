<template>
  <div class="admin-page">
    <h1 class="page-title">Redemption Monitoring</h1>

    <div class="tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        History
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'queue' }"
        @click="activeTab = 'queue'; fetchQueue()"
      >
        Queue
        <span v-if="pendingCount > 0" class="tab-badge">{{ pendingCount }}</span>
      </button>
    </div>

    <!-- History Tab -->
    <div v-if="activeTab === 'history'" class="tab-content">
      <div class="toolbar">
        <input
          v-model="fidFilter"
          type="text"
          class="search-input"
          placeholder="Filter by FID..."
          @input="debouncedFetchHistory"
        />
        <input
          v-model="codeFilter"
          type="text"
          class="search-input"
          placeholder="Filter by code..."
          @input="debouncedFetchHistory"
        />
      </div>
      <div class="info-bar">
        <span>{{ historyList.length }} / {{ totalHistory }} redemptions</span>
      </div>

      <div ref="historyWrapperRef" class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>FID</th>
              <th></th>
              <th>Nickname</th>
              <th>Code</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in historyList" :key="r.id">
              <td data-label="ID">{{ r.id }}</td>
              <td data-label="FID">{{ r.fid }}</td>
              <td class="avatar-cell">
                <img :src="r.avatar_url || '/images/default-avatar.png'" :alt="r.nickname || r.fid" class="avatar" referrerpolicy="no-referrer" />
              </td>
              <td data-label="Nickname">{{ r.nickname || '-' }}</td>
              <td data-label="Code"><code>{{ r.code }}</code></td>
              <td data-label="Status"><span class="badge" :class="redemptionStatusClass(r.status)">{{ r.status }}</span></td>
              <td data-label="Time">{{ formatDate(r.redeemed_at) }}</td>
            </tr>
            <tr v-if="historyList.length === 0 && !loadingHistory">
              <td colspan="7" class="empty">No redemptions found</td>
            </tr>
            <tr v-if="historyHasMore">
              <td colspan="7" class="sentinel-cell">
                <div ref="historySentinelRef" class="sentinel"></div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loadingHistory" class="loading">Loading...</div>
      </div>
    </div>

    <!-- Queue Tab -->
    <div v-if="activeTab === 'queue'" class="tab-content">
      <div class="toolbar">
        <span class="info-text">{{ pendingCount }} pending items in queue</span>
        <button
          v-if="selectedIds.length > 0"
          class="toolbar-btn btn-primary"
          :disabled="queueBusy || selectedRetryableIds.length === 0"
          title="Only failed or processing items can be retried"
          @click="retrySelected"
        >
          {{ retrying ? 'Retrying...' : `Retry Selected (${selectedRetryableIds.length})` }}
        </button>
        <button
          v-if="selectedIds.length > 0"
          class="toolbar-btn btn-secondary"
          :disabled="queueBusy"
          title="Refresh nickname, avatar and kingdom of the selected items' users (inactive / not found users are deactivated)"
          @click="refreshSelectedProfiles"
        >
          {{ refreshing ? `Refreshing... (${refreshing.done}/${refreshing.total})` : `Refresh Profile (${selectedFids.length})` }}
        </button>
        <button
          v-if="selectedIds.length > 0"
          class="toolbar-btn btn-danger"
          :disabled="queueBusy"
          @click="removeSelected"
        >
          {{ removing ? 'Removing...' : `Remove Selected (${selectedIds.length})` }}
        </button>
      </div>

      <div v-if="retryMessage" class="message message-success">{{ retryMessage }}</div>
      <div class="info-bar">
        <span>{{ queueList.length }} / {{ totalQueue }} items</span>
      </div>

      <div ref="queueWrapperRef" class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th class="check-cell"><input type="checkbox" @change="toggleAll" :checked="allSelected" /></th>
              <th>ID</th>
              <th>FID</th>
              <th>Kingdom</th>
              <th></th>
              <th>Nickname</th>
              <th>Code</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Error</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in queueList" :key="item.id">
              <td class="check-cell" data-label="Select">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(item.id)"
                  @change="toggleSelect(item.id)"
                />
              </td>
              <td data-label="ID">{{ item.id }}</td>
              <td data-label="FID">{{ item.fid }}</td>
              <td data-label="Kingdom">{{ item.kingdom || '-' }}</td>
              <td class="avatar-cell">
                <img :src="item.avatar_url || '/images/default-avatar.png'" :alt="item.nickname || item.fid" class="avatar" referrerpolicy="no-referrer" />
              </td>
              <td data-label="Nickname">{{ item.nickname || '-' }}</td>
              <td data-label="Code"><code>{{ item.code }}</code></td>
              <td data-label="Status"><span class="badge" :class="queueStatusClass(item.status)">{{ item.status }}</span></td>
              <td data-label="Attempts">{{ item.attempts }}</td>
              <td class="error-cell" data-label="Error">{{ item.error_message || '-' }}</td>
              <td data-label="Created">{{ formatDate(item.created_at) }}</td>
            </tr>
            <tr v-if="queueList.length === 0 && !loadingQueue">
              <td colspan="11" class="empty">Queue is empty</td>
            </tr>
            <tr v-if="queueHasMore">
              <td colspan="11" class="sentinel-cell">
                <div ref="queueSentinelRef" class="sentinel"></div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loadingQueue" class="loading">Loading...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueueItem, Redemption } from '~~/server/utils/db';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

const PAGE_SIZE = 50;
// Pause between users in a bulk profile refresh (same pace as the redemption failures page)
const REFRESH_INTERVAL_MS = 1500;

const activeTab = ref<'history' | 'queue'>('history');

// History state
const fidFilter = ref('');
const codeFilter = ref('');
const historyList = ref<Redemption[]>([]);
const totalHistory = ref(0);
const historyHasMore = ref(false);
const historyOffset = ref(0);
const historyWrapperRef = ref<HTMLElement | null>(null);
const historySentinelRef = ref<HTMLElement | null>(null);
const loadingHistory = ref(true);

// Queue state
const queueList = ref<QueueItem[]>([]);
const totalQueue = ref(0);
const queueHasMore = ref(false);
const queueOffset = ref(0);
const queueWrapperRef = ref<HTMLElement | null>(null);
const queueSentinelRef = ref<HTMLElement | null>(null);
const pendingCount = ref(0);
const loadingQueue = ref(false);
const selectedIds = ref<number[]>([]);
const retrying = ref(false);
const removing = ref(false);
const refreshing = ref<{ done: number; total: number } | null>(null);
const retryMessage = ref('');
const queueBusy = computed(() => retrying.value || removing.value || !!refreshing.value);

let debounceTimer: ReturnType<typeof setTimeout>;

function debouncedFetchHistory() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchHistory, 300);
}

async function fetchHistory() {
  loadingHistory.value = true;
  historyOffset.value = 0;
  historyList.value = [];
  try {
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: '0' };
    if (fidFilter.value.trim()) params.fid = fidFilter.value.trim();
    if (codeFilter.value.trim()) params.code = codeFilter.value.trim();

    const res: any = await $fetch('/api/admin/redemptions', { params });
    historyList.value = res.redemptions;
    totalHistory.value = res.total;
    historyHasMore.value = res.hasMore;
    historyOffset.value = res.redemptions.length;
  } catch (e) {
    console.error('Failed to fetch history:', e);
  } finally {
    loadingHistory.value = false;
  }
}

async function fetchMoreHistory() {
  if (loadingHistory.value || !historyHasMore.value) return;
  loadingHistory.value = true;
  try {
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(historyOffset.value) };
    if (fidFilter.value.trim()) params.fid = fidFilter.value.trim();
    if (codeFilter.value.trim()) params.code = codeFilter.value.trim();

    const res: any = await $fetch('/api/admin/redemptions', { params });
    historyList.value.push(...res.redemptions);
    totalHistory.value = res.total;
    historyHasMore.value = res.hasMore;
    historyOffset.value += res.redemptions.length;
  } catch (e) {
    console.error('Failed to fetch more history:', e);
  } finally {
    loadingHistory.value = false;
  }
}

async function fetchQueue() {
  loadingQueue.value = true;
  queueOffset.value = 0;
  queueList.value = [];
  try {
    const res: any = await $fetch('/api/admin/redemptions/queue', {
      params: { limit: String(PAGE_SIZE), offset: '0' },
    });
    queueList.value = res.items;
    totalQueue.value = res.total;
    queueHasMore.value = res.hasMore;
    queueOffset.value = res.items.length;
    pendingCount.value = res.pendingCount;
  } catch (e) {
    console.error('Failed to fetch queue:', e);
  } finally {
    loadingQueue.value = false;
  }
}

async function fetchMoreQueue() {
  if (loadingQueue.value || !queueHasMore.value) return;
  loadingQueue.value = true;
  try {
    const res: any = await $fetch('/api/admin/redemptions/queue', {
      params: { limit: String(PAGE_SIZE), offset: String(queueOffset.value) },
    });
    queueList.value.push(...res.items);
    totalQueue.value = res.total;
    queueHasMore.value = res.hasMore;
    queueOffset.value += res.items.length;
  } catch (e) {
    console.error('Failed to fetch more queue:', e);
  } finally {
    loadingQueue.value = false;
  }
}

function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

// Any item can be selected (for removal); only failed/processing ones can be retried
const selectedRetryableIds = computed(() =>
  queueList.value
    .filter(i => ['failed', 'processing'].includes(i.status) && selectedIds.value.includes(i.id))
    .map(i => i.id)
);

const allSelected = computed(() =>
  queueList.value.length > 0 &&
  queueList.value.every(i => selectedIds.value.includes(i.id))
);

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    selectedIds.value = queueList.value.map(i => i.id);
  } else {
    selectedIds.value = [];
  }
}

// A user can have several selected items; each user is refreshed once
const selectedFids = computed(() => [
  ...new Set(queueList.value.filter(i => selectedIds.value.includes(i.id)).map(i => i.fid)),
]);

async function refreshSelectedProfiles() {
  const fids = selectedFids.value;
  if (fids.length === 0) return;
  if (!confirm(`Refresh the profile (nickname, avatar, kingdom) of ${fids.length} user(s)? Users not found or inactive are deactivated and their queue items removed.`)) return;
  refreshing.value = { done: 0, total: fids.length };
  retryMessage.value = '';
  const counts = { updated: 0, kingdom: 0, deactivated: 0, notFound: 0, failed: 0 };
  for (const fid of fids) {
    try {
      const res: any = await $fetch(`/api/admin/users/${fid}/refresh-profile`, { method: 'POST' });
      if (res.result === 'updated') counts.updated++;
      else if (res.result === 'not_found') counts.notFound++;
      else counts.failed++;
      if (res.kingdom?.status === 'updated') counts.kingdom++;
      if (res.deactivated) counts.deactivated++;
    } catch {
      counts.failed++;
    }
    refreshing.value!.done++;
    if (refreshing.value!.done < fids.length) {
      await new Promise(resolve => setTimeout(resolve, REFRESH_INTERVAL_MS));
    }
  }
  refreshing.value = null;
  retryMessage.value = `Profiles refreshed: ${counts.updated} updated (${counts.kingdom} kingdom changes, ${counts.deactivated} deactivated), ${counts.notFound} not found, ${counts.failed} failed`;
  selectedIds.value = [];
  fetchQueue();
}

async function removeSelected() {
  if (selectedIds.value.length === 0) return;
  if (!confirm(`Remove ${selectedIds.value.length} item(s) from the queue? They will not be redeemed.`)) return;
  removing.value = true;
  retryMessage.value = '';
  try {
    const res: any = await $fetch('/api/admin/redemptions/remove', {
      method: 'POST',
      body: { ids: selectedIds.value },
    });
    retryMessage.value = `${res.removedCount} items removed from the queue`;
    selectedIds.value = [];
    fetchQueue();
  } catch (e: any) {
    retryMessage.value = e?.data?.message || 'Remove failed';
  } finally {
    removing.value = false;
  }
}

async function retrySelected() {
  if (selectedRetryableIds.value.length === 0) return;
  retrying.value = true;
  retryMessage.value = '';
  try {
    const res: any = await $fetch('/api/admin/redemptions/retry', {
      method: 'POST',
      body: { ids: selectedRetryableIds.value },
    });
    retryMessage.value = `${res.resetCount} items reset to pending`;
    selectedIds.value = [];
    fetchQueue();
  } catch (e: any) {
    retryMessage.value = e?.data?.message || 'Retry failed';
  } finally {
    retrying.value = false;
  }
}

function redemptionStatusClass(status: string) {
  const s = status.toUpperCase();
  if (['SUCCESS', 'RECEIVED'].includes(s)) return 'badge-success';
  if (s.includes('PENDING')) return 'badge-warning';
  return 'badge-danger';
}

function queueStatusClass(status: string) {
  switch (status) {
    case 'pending': return 'badge-warning';
    case 'processing': return 'badge-info';
    case 'failed': return 'badge-danger';
    default: return 'badge-muted';
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleString();
}

let historyObserver: IntersectionObserver | null = null;
let queueObserver: IntersectionObserver | null = null;

watch(historySentinelRef, (el) => {
  if (historyObserver) historyObserver.disconnect();
  if (!el || !historyWrapperRef.value) return;
  historyObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) fetchMoreHistory();
  }, { root: historyWrapperRef.value, threshold: 0 });
  historyObserver.observe(el);
});

watch(queueSentinelRef, (el) => {
  if (queueObserver) queueObserver.disconnect();
  if (!el || !queueWrapperRef.value) return;
  queueObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) fetchMoreQueue();
  }, { root: queueWrapperRef.value, threshold: 0 });
  queueObserver.observe(el);
});

onMounted(() => {
  fetchHistory();
  fetchQueue();
});

onUnmounted(() => {
  historyObserver?.disconnect();
  queueObserver?.disconnect();
});
</script>

<style scoped>
.check-cell {
  width: 40px;
}

@media (max-width: 720px) {
  .toolbar .search-input {
    flex-basis: calc(50% - 4px);
  }
}
</style>
