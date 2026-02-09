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
    <div v-if="activeTab === 'history'">
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

      <div class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>FID</th>
              <th>Nickname</th>
              <th>Code</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in historyList" :key="r.id">
              <td>{{ r.id }}</td>
              <td>{{ r.fid }}</td>
              <td>{{ r.nickname || '-' }}</td>
              <td><code>{{ r.code }}</code></td>
              <td><span class="badge" :class="redemptionStatusClass(r.status)">{{ r.status }}</span></td>
              <td>{{ formatDate(r.redeemed_at) }}</td>
            </tr>
            <tr v-if="historyList.length === 0 && !loadingHistory">
              <td colspan="6" class="empty">No redemptions found</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loadingHistory" class="loading">Loading...</div>
    </div>

    <!-- Queue Tab -->
    <div v-if="activeTab === 'queue'">
      <div class="toolbar">
        <span class="info-text">{{ pendingCount }} pending items in queue</span>
        <button
          v-if="selectedIds.length > 0"
          class="toolbar-btn btn-primary"
          :disabled="retrying"
          @click="retrySelected"
        >
          {{ retrying ? 'Retrying...' : `Retry Selected (${selectedIds.length})` }}
        </button>
      </div>

      <div v-if="retryMessage" class="message message-success">{{ retryMessage }}</div>

      <div class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th><input type="checkbox" @change="toggleAll" :checked="allSelected" /></th>
              <th>ID</th>
              <th>FID</th>
              <th>Code</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Error</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in queueList" :key="item.id">
              <td>
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(item.id)"
                  :disabled="!['failed', 'processing'].includes(item.status)"
                  @change="toggleSelect(item.id)"
                />
              </td>
              <td>{{ item.id }}</td>
              <td>{{ item.fid }}</td>
              <td><code>{{ item.code }}</code></td>
              <td><span class="badge" :class="queueStatusClass(item.status)">{{ item.status }}</span></td>
              <td>{{ item.attempts }}</td>
              <td class="error-cell">{{ item.error_message || '-' }}</td>
              <td>{{ formatDate(item.created_at) }}</td>
            </tr>
            <tr v-if="queueList.length === 0 && !loadingQueue">
              <td colspan="8" class="empty">Queue is empty</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loadingQueue" class="loading">Loading...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueueItem, Redemption } from '~/server/utils/db';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

const activeTab = ref<'history' | 'queue'>('history');

// History state
const fidFilter = ref('');
const codeFilter = ref('');
const historyList = ref<Redemption[]>([]);
const loadingHistory = ref(true);

// Queue state
const queueList = ref<QueueItem[]>([]);
const pendingCount = ref(0);
const loadingQueue = ref(false);
const selectedIds = ref<number[]>([]);
const retrying = ref(false);
const retryMessage = ref('');

let debounceTimer: ReturnType<typeof setTimeout>;

function debouncedFetchHistory() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchHistory, 300);
}

async function fetchHistory() {
  loadingHistory.value = true;
  try {
    const params: Record<string, string> = {};
    if (fidFilter.value.trim()) params.fid = fidFilter.value.trim();
    if (codeFilter.value.trim()) params.code = codeFilter.value.trim();

    const res: any = await $fetch('/api/admin/redemptions', { params });
    historyList.value = res.redemptions;
  } catch (e) {
    console.error('Failed to fetch history:', e);
  } finally {
    loadingHistory.value = false;
  }
}

async function fetchQueue() {
  loadingQueue.value = true;
  try {
    const res: any = await $fetch('/api/admin/redemptions/queue');
    queueList.value = res.items;
    pendingCount.value = res.pendingCount;
  } catch (e) {
    console.error('Failed to fetch queue:', e);
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

const retryableItems = computed(() =>
  queueList.value.filter(i => ['failed', 'processing'].includes(i.status))
);

const allSelected = computed(() =>
  retryableItems.value.length > 0 &&
  retryableItems.value.every(i => selectedIds.value.includes(i.id))
);

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    selectedIds.value = retryableItems.value.map(i => i.id);
  } else {
    selectedIds.value = [];
  }
}

async function retrySelected() {
  if (selectedIds.value.length === 0) return;
  retrying.value = true;
  retryMessage.value = '';
  try {
    const res: any = await $fetch('/api/admin/redemptions/retry', {
      method: 'POST',
      body: { ids: selectedIds.value },
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

onMounted(() => {
  fetchHistory();
  fetchQueue();
});
</script>

<style scoped>
.admin-page {
  font-family: 'Cinzel', serif;
  color: #5C4A35;
}

.page-title {
  font-size: 1.6rem;
  color: #6b472c;
  margin: 0 0 24px;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 2px solid rgba(92, 74, 53, 0.08);
  padding-bottom: 0;
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  color: #8B7355;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s ease;
  position: relative;
}

.tab-btn:hover {
  color: #6b472c;
}

.tab-btn.active {
  color: #6b472c;
  border-bottom-color: #D4A574;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #E06A6A;
  color: #fff;
  font-size: 0.65rem;
  margin-left: 6px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 150px;
  padding: 10px 14px;
  border: 1px solid rgba(92, 74, 53, 0.2);
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.9rem;
  color: #5C4A35;
  background: #FFF8EF;
}

.search-input:focus {
  outline: none;
  border-color: #D4A574;
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15);
}

.info-text {
  font-size: 0.85rem;
  color: #8B7355;
}

.toolbar-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #6b472c, #7b5a36);
  color: #F5E6D3;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #7b5a36, #8B6F47);
}

.message {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.message-success {
  background: rgba(107, 142, 35, 0.1);
  color: #6B8E23;
  border: 1px solid rgba(107, 142, 35, 0.2);
}

.table-wrapper {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 10px;
  overflow: hidden;
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

.admin-table td {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(92, 74, 53, 0.05);
}

.admin-table tbody tr:hover {
  background: rgba(245, 230, 211, 0.3);
}

.admin-table code {
  background: rgba(107, 71, 44, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
}

.admin-table input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.error-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  color: #8B7355;
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

.badge-success { background: rgba(107, 142, 35, 0.12); color: #6B8E23; }
.badge-warning { background: rgba(212, 165, 116, 0.2); color: #A0826D; }
.badge-danger { background: rgba(224, 106, 106, 0.12); color: #E06A6A; }
.badge-info { background: rgba(70, 130, 180, 0.12); color: #4682B4; }
.badge-muted { background: rgba(139, 115, 85, 0.1); color: #8B7355; }
</style>
