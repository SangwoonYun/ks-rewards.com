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
        @click="openQueueTab"
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
                <UserAvatar :src="r.avatar_url" :alt="r.nickname || r.fid" class="avatar" />
              </td>
              <td data-label="Nickname">{{ r.nickname || '-' }}</td>
              <td data-label="Code"><code>{{ r.code }}</code></td>
              <td data-label="Status"><span class="badge" :class="redemptionStatusClass(r.status)">{{ r.status }}</span></td>
              <td data-label="Time">{{ formatDateTime(r.redeemed_at) }}</td>
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
          v-if="refreshing"
          class="toolbar-btn btn-danger"
          :disabled="refreshing.cancel"
          @click="refreshing.cancel = true"
        >
          {{ refreshing.cancel ? 'Stopping...' : 'Stop' }}
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

      <ResultBanner :flash="queueFlash" @dismiss="clearQueueMessage" />
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
                  :checked="isSelected(item.id)"
                  @change="toggleSelect(item.id)"
                />
              </td>
              <td data-label="ID">{{ item.id }}</td>
              <td data-label="FID">{{ item.fid }}</td>
              <td data-label="Kingdom">{{ item.kingdom || '-' }}</td>
              <td class="avatar-cell">
                <UserAvatar :src="item.avatar_url" :alt="item.nickname || item.fid" class="avatar" />
              </td>
              <td data-label="Nickname">{{ item.nickname || '-' }}</td>
              <td data-label="Code"><code>{{ item.code }}</code></td>
              <td data-label="Status"><span class="badge" :class="queueStatusClass(item.status)">{{ item.status }}</span></td>
              <td data-label="Attempts">{{ item.attempts }}</td>
              <td class="error-cell" data-label="Error">{{ item.error_message || '-' }}</td>
              <td data-label="Created">{{ formatDateTime(item.created_at) }}</td>
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
import type { QueueItem, Redemption } from '~~/server/db';

definePageMeta({
  layout: 'admin',
});

// Pause between users in a bulk profile refresh (same pace as the redemption failures page)
const REFRESH_INTERVAL_MS = 1500;

const activeTab = ref<'history' | 'queue'>('history');

// History state
const fidFilter = ref('');
const codeFilter = ref('');
const {
  items: historyList,
  total: totalHistory,
  hasMore: historyHasMore,
  loading: loadingHistory,
  refresh: fetchHistory,
  rootRef: historyWrapperRef,
  sentinelRef: historySentinelRef,
} = usePaginatedList<Redemption>('/api/admin/redemptions', {
  itemsKey: 'redemptions',
  params: () => {
    const params: Record<string, string> = {};
    if (fidFilter.value.trim()) params.fid = fidFilter.value.trim();
    if (codeFilter.value.trim()) params.code = codeFilter.value.trim();
    return params;
  },
});
const debouncedFetchHistory = useDebounceFn(fetchHistory, 300);

// Queue state
const pendingCount = ref(0);
const {
  items: queueList,
  total: totalQueue,
  hasMore: queueHasMore,
  loading: loadingQueue,
  refresh: refreshQueue,
  rootRef: queueWrapperRef,
  sentinelRef: queueSentinelRef,
} = usePaginatedList<QueueItem>('/api/admin/redemptions/queue', {
  itemsKey: 'items',
  onResponse: (res) => { pendingCount.value = res.pendingCount; },
});
const { selected, has: isSelected, toggle: toggleSelect, setAll, clear: clearSelection } = useSelection<number>();
const retrying = ref(false);
const removing = ref(false);
const refreshing = ref<{ done: number; total: number; cancel: boolean } | null>(null);
const { flash: queueFlash, show: showQueueMessage, clear: clearQueueMessage } = useFlash();
const queueBusy = computed(() => retrying.value || removing.value || !!refreshing.value);

// The selection only refers to the rows of the list it was made on
function fetchQueue() {
  clearSelection();
  return refreshQueue();
}

function openQueueTab() {
  if (activeTab.value === 'queue') return;
  activeTab.value = 'queue';
  fetchQueue();
}

const selectedIds = computed(() => [...selected.value]);

// Any item can be selected (for removal); only failed/processing ones can be retried
const selectedRetryableIds = computed(() =>
  queueList.value
    .filter(i => ['failed', 'processing'].includes(i.status) && isSelected(i.id))
    .map(i => i.id)
);

const allSelected = computed(() =>
  queueList.value.length > 0 &&
  queueList.value.every(i => isSelected(i.id))
);

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    setAll(queueList.value.map(i => i.id), true);
  } else {
    clearSelection();
  }
}

// A user can have several selected items; each user is refreshed once
const selectedFids = computed(() => [
  ...new Set(queueList.value.filter(i => isSelected(i.id)).map(i => i.fid)),
]);

let unmounted = false;

async function refreshSelectedProfiles() {
  const fids = selectedFids.value;
  if (fids.length === 0) return;
  if (!confirm(`Refresh the profile (nickname, avatar, kingdom) of ${fids.length} user(s)? Users not found or inactive are deactivated and their queue items removed.`)) return;
  const run = { done: 0, total: fids.length, cancel: false };
  refreshing.value = run;
  clearQueueMessage();
  const counts = { updated: 0, kingdom: 0, deactivated: 0, notFound: 0, failed: 0 };
  for (const fid of fids) {
    if (run.cancel) break;
    try {
      const res: any = await $fetch(`/api/admin/users/${fid}/refresh-profile`, { method: 'POST' });
      if (res.result === 'updated') counts.updated++;
      else if (res.result === 'not_found') counts.notFound++;
      else counts.failed++;
      if (res.kingdom?.status === 'updated') counts.kingdom++;
      // Shown within "updated" in the summary: not-found users are deactivated too, but counted as not found
      if (res.result === 'updated' && res.deactivated) counts.deactivated++;
    } catch {
      counts.failed++;
    }
    refreshing.value!.done++;
    if (run.done < fids.length && !run.cancel) {
      await new Promise(resolve => setTimeout(resolve, REFRESH_INTERVAL_MS));
    }
  }
  if (unmounted) return;
  refreshing.value = null;
  showQueueMessage(
    counts.failed === 0,
    `Profiles refreshed: ${counts.updated} updated (${counts.kingdom} kingdom changes, ${counts.deactivated} deactivated), ${counts.notFound} not found, ${counts.failed} failed` +
      (run.done < fids.length ? ` (stopped after ${run.done}/${fids.length})` : ''),
  );
  fetchQueue();
}

async function removeSelected() {
  if (selectedIds.value.length === 0) return;
  if (!confirm(`Remove ${selectedIds.value.length} item(s) from the queue? They will not be redeemed.`)) return;
  removing.value = true;
  clearQueueMessage();
  try {
    const res: any = await $fetch('/api/admin/redemptions/remove', {
      method: 'POST',
      body: { ids: selectedIds.value },
    });
    showQueueMessage(true, `${res.removedCount} items removed from the queue`);
    fetchQueue();
  } catch (e: any) {
    showQueueMessage(false, e?.data?.message || 'Remove failed');
  } finally {
    removing.value = false;
  }
}

async function retrySelected() {
  if (selectedRetryableIds.value.length === 0) return;
  retrying.value = true;
  clearQueueMessage();
  try {
    const res: any = await $fetch('/api/admin/redemptions/retry', {
      method: 'POST',
      body: { ids: selectedRetryableIds.value },
    });
    showQueueMessage(true, `${res.resetCount} items reset to pending`);
    fetchQueue();
  } catch (e: any) {
    showQueueMessage(false, e?.data?.message || 'Retry failed');
  } finally {
    retrying.value = false;
  }
}

onMounted(() => {
  fetchHistory();
  fetchQueue();
});

onUnmounted(() => {
  unmounted = true;
  if (refreshing.value) refreshing.value.cancel = true;
});
</script>

<style scoped>
@media (max-width: 720px) {
  .toolbar .search-input {
    flex-basis: calc(50% - 4px);
  }
}
</style>
