<template>
  <div class="admin-page">
    <h1 class="page-title">Priority Queue</h1>

    <div class="tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'users' }"
        @click="activeTab = 'users'"
      >
        Registered Users
        <span class="tab-badge-count">{{ registeredUsers.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'queue' }"
        @click="activeTab = 'queue'"
      >
        Queue
        <span v-if="pendingCount > 0" class="tab-badge">{{ pendingCount }}</span>
      </button>
    </div>

    <!-- Registered Users Tab -->
    <div v-if="activeTab === 'users'" class="tab-content">
      <div class="toolbar">
        <p class="page-desc">Register users to process their codes with the highest priority in every queue run.</p>
        <div class="dropdown-wrapper" ref="dropdownRef">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="Search by FID or nickname..."
            @focus="showDropdown = true"
            @input="onSearchInput"
          />
          <div v-if="showDropdown && filteredUsers.length > 0" class="dropdown-list">
            <div
              v-for="user in filteredUsers"
              :key="user.fid"
              class="dropdown-item"
              @mousedown.prevent="selectUser(user)"
            >
              <span class="dropdown-nickname">{{ user.nickname || 'Unknown' }}</span>
              <span class="dropdown-fid">{{ user.fid }}</span>
              <span v-if="isPriorityUser(user.fid)" class="dropdown-badge">Priority</span>
            </div>
          </div>
          <div v-if="showDropdown && searchQuery.trim() && filteredUsers.length === 0 && !loadingUsers" class="dropdown-list">
            <div class="dropdown-empty">No users found</div>
          </div>
        </div>
        <div v-if="addResult" class="result-banner" :class="addResult.success ? 'result-success' : 'result-error'">
          {{ addResult.message }}
          <button class="dismiss-btn" @click="addResult = null">&times;</button>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>FID</th>
              <th></th>
              <th>Nickname</th>
              <th>Kingdom</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pu in registeredUsers" :key="pu.fid">
              <td>{{ pu.fid }}</td>
              <td class="avatar-cell">
                <img v-if="pu.avatar_url" :src="pu.avatar_url" :alt="pu.nickname || pu.fid" class="avatar" referrerpolicy="no-referrer" />
                <div v-else class="avatar avatar-placeholder">{{ (pu.nickname || pu.fid).charAt(0).toUpperCase() }}</div>
              </td>
              <td>{{ pu.nickname || '-' }}</td>
              <td>{{ pu.kingdom || '-' }}</td>
              <td>
                <input
                  v-if="editingFid === pu.fid"
                  ref="priorityInputRef"
                  v-model.number="editingValue"
                  type="number"
                  min="1"
                  max="100"
                  class="priority-input"
                  @blur="savePriority(pu)"
                  @keyup.enter="($event.target as HTMLInputElement).blur()"
                  @keyup.escape="cancelEdit"
                />
                <span
                  v-else
                  class="badge badge-priority editable"
                  @dblclick="startEdit(pu)"
                >{{ pu.priority }}</span>
              </td>
              <td>
                <span class="badge" :class="pu.active ? 'badge-success' : 'badge-danger'">
                  {{ pu.active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>{{ formatDate(pu.added_at) }}</td>
              <td>
                <button
                  class="action-btn btn-remove"
                  :disabled="removing === pu.fid"
                  @click="removeUser(pu.fid)"
                >
                  {{ removing === pu.fid ? '...' : 'Remove' }}
                </button>
              </td>
            </tr>
            <tr v-if="registeredUsers.length === 0 && !loading">
              <td colspan="8" class="empty">No priority users registered</td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="loading">Loading...</div>
      </div>
    </div>

    <!-- Queue Tab -->
    <div v-if="activeTab === 'queue'" class="tab-content">
      <div class="info-bar">
        <span>{{ pendingCount }} pending / {{ totalQueueItems }} total (showing {{ queueItems.length }})</span>
      </div>
      <div ref="queueWrapperRef" class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>FID</th>
              <th></th>
              <th>Nickname</th>
              <th>Code</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Error</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in queueItems" :key="item.id">
              <td>{{ item.id }}</td>
              <td>{{ item.fid }}</td>
              <td class="avatar-cell">
                <img v-if="item.avatar_url" :src="item.avatar_url" :alt="item.nickname || item.fid" class="avatar" referrerpolicy="no-referrer" />
                <div v-else class="avatar avatar-placeholder">{{ (item.nickname || item.fid).charAt(0).toUpperCase() }}</div>
              </td>
              <td>{{ item.nickname || '-' }}</td>
              <td><code>{{ item.code }}</code></td>
              <td><span class="badge badge-priority">{{ item.priority }}</span></td>
              <td><span class="badge" :class="statusClass(item.status)">{{ item.status }}</span></td>
              <td>{{ item.attempts }}</td>
              <td class="error-cell">{{ item.error_message || '-' }}</td>
              <td>{{ formatDate(item.created_at) }}</td>
            </tr>
            <tr v-if="queueItems.length === 0 && !loading">
              <td colspan="10" class="empty">No priority items in queue</td>
            </tr>
            <tr v-if="queueHasMore">
              <td colspan="10" class="sentinel-cell">
                <div ref="queueSentinelRef" class="sentinel"></div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="loading">Loading...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueueItem, User, PriorityUser } from '~/server/utils/db';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

const activeTab = ref<'users' | 'queue'>('users');

// Search / dropdown state
const searchQuery = ref('');
const showDropdown = ref(false);
const allUsers = ref<User[]>([]);
const loadingUsers = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

// Add result
const addResult = ref<{ success: boolean; message: string } | null>(null);

const PAGE_SIZE = 50;

// Priority data
const registeredUsers = ref<PriorityUser[]>([]);
const queueItems = ref<QueueItem[]>([]);
const pendingCount = ref(0);
const totalQueueItems = ref(0);
const queueHasMore = ref(false);
const queueOffset = ref(0);
const queueWrapperRef = ref<HTMLElement | null>(null);
const queueSentinelRef = ref<HTMLElement | null>(null);
const loading = ref(true);
const removing = ref<string | null>(null);

// Inline priority editing
const editingFid = ref<string | null>(null);
const editingValue = ref<number>(10);
const priorityInputRef = ref<HTMLInputElement[] | null>(null);

function startEdit(pu: PriorityUser) {
  editingFid.value = pu.fid;
  editingValue.value = pu.priority;
  nextTick(() => {
    if (priorityInputRef.value && priorityInputRef.value[0]) {
      priorityInputRef.value[0].focus();
      priorityInputRef.value[0].select();
    }
  });
}

function cancelEdit() {
  editingFid.value = null;
}

async function savePriority(pu: PriorityUser) {
  const fid = pu.fid;
  const newPriority = Math.min(100, Math.max(1, editingValue.value));
  editingFid.value = null;

  if (newPriority === pu.priority) return;

  try {
    await $fetch('/api/admin/priority/update', {
      method: 'POST',
      body: { fid, priority: newPriority },
    });
    pu.priority = newPriority;
  } catch (e) {
    console.error('Failed to update priority:', e);
  }
}

const priorityFidSet = computed(() => new Set(registeredUsers.value.map((u: PriorityUser) => u.fid)));

function isPriorityUser(fid: string) {
  return priorityFidSet.value.has(fid);
}

const filteredUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return allUsers.value.filter((u: User) => u.active === 1).slice(0, 20);
  return allUsers.value
    .filter((u: User) =>
      u.active === 1 &&
      (u.fid.toLowerCase().includes(q) || (u.nickname && u.nickname.toLowerCase().includes(q)))
    )
    .slice(0, 20);
});

function onSearchInput() {
  showDropdown.value = true;
}

async function selectUser(user: User) {
  showDropdown.value = false;
  searchQuery.value = '';

  if (isPriorityUser(user.fid)) {
    addResult.value = { success: false, message: `${user.nickname || user.fid} is already in priority queue` };
    setTimeout(() => { addResult.value = null; }, 3000);
    return;
  }

  addResult.value = null;
  try {
    const res: any = await $fetch('/api/admin/priority/add', {
      method: 'POST',
      body: { fid: user.fid },
    });
    addResult.value = {
      success: res.success,
      message: `${user.nickname || user.fid}: ${res.message}`,
    };
    fetchData();
    setTimeout(() => { addResult.value = null; }, 5000);
  } catch (e: any) {
    addResult.value = {
      success: false,
      message: e?.data?.message || 'Failed to add user',
    };
  }
}

async function removeUser(fid: string) {
  removing.value = fid;
  try {
    await $fetch('/api/admin/priority/remove', {
      method: 'POST',
      body: { fid },
    });
    registeredUsers.value = registeredUsers.value.filter((u: PriorityUser) => u.fid !== fid);
  } catch (e) {
    console.error('Failed to remove user:', e);
  } finally {
    removing.value = null;
  }
}

async function fetchUsers() {
  loadingUsers.value = true;
  try {
    const res: any = await $fetch('/api/admin/users');
    allUsers.value = res.users;
  } catch (e) {
    console.error('Failed to fetch users:', e);
  } finally {
    loadingUsers.value = false;
  }
}

async function fetchData() {
  loading.value = true;
  queueOffset.value = 0;
  queueItems.value = [];
  try {
    const res: any = await $fetch('/api/admin/priority/queue', {
      params: { queueLimit: String(PAGE_SIZE), queueOffset: '0' },
    });
    registeredUsers.value = res.registeredUsers;
    queueItems.value = res.queueItems;
    pendingCount.value = res.pendingCount;
    totalQueueItems.value = res.totalQueueItems;
    queueHasMore.value = res.queueHasMore;
    queueOffset.value = res.queueItems.length;
  } catch (e) {
    console.error('Failed to fetch priority data:', e);
  } finally {
    loading.value = false;
  }
}

async function fetchMoreQueue() {
  if (loading.value || !queueHasMore.value) return;
  loading.value = true;
  try {
    const res: any = await $fetch('/api/admin/priority/queue', {
      params: { queueLimit: String(PAGE_SIZE), queueOffset: String(queueOffset.value) },
    });
    queueItems.value.push(...res.queueItems);
    queueHasMore.value = res.queueHasMore;
    queueOffset.value += res.queueItems.length;
  } catch (e) {
    console.error('Failed to fetch more queue items:', e);
  } finally {
    loading.value = false;
  }
}

function statusClass(status: string) {
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

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showDropdown.value = false;
  }
}

let queueObserver: IntersectionObserver | null = null;

watch(queueSentinelRef, (el) => {
  if (queueObserver) queueObserver.disconnect();
  if (!el || !queueWrapperRef.value) return;
  queueObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) fetchMoreQueue();
  }, { root: queueWrapperRef.value, threshold: 0 });
  queueObserver.observe(el);
});

onMounted(() => {
  fetchData();
  fetchUsers();
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  queueObserver?.disconnect();
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

.page-desc {
  font-size: 0.85rem;
  color: #8B7355;
  margin: 0 0 12px;
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
  display: flex;
  align-items: center;
  gap: 6px;
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
}

.tab-badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(138, 43, 226, 0.15);
  color: #8A2BE2;
  font-size: 0.65rem;
}

.tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.toolbar {
  margin-bottom: 16px;
}

.info-bar {
  font-size: 0.8rem;
  color: #8B7355;
  margin-bottom: 12px;
}

/* Dropdown */
.dropdown-wrapper {
  position: relative;
  max-width: 400px;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(92, 74, 53, 0.2);
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.9rem;
  color: #5C4A35;
  background: #FFF8EF;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: #D4A574;
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15);
}

.dropdown-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 260px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid rgba(92, 74, 53, 0.15);
  border-top: none;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 50;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s ease;
  font-size: 0.85rem;
}

.dropdown-item:hover {
  background: rgba(245, 230, 211, 0.5);
}

.dropdown-nickname {
  font-weight: 700;
  color: #5C4A35;
}

.dropdown-fid {
  color: #8B7355;
  font-size: 0.8rem;
}

.dropdown-badge {
  margin-left: auto;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(138, 43, 226, 0.12);
  color: #8A2BE2;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dropdown-empty {
  padding: 12px 14px;
  color: #8B7355;
  font-size: 0.85rem;
  text-align: center;
}

/* Tables */
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

.avatar-placeholder {
  background: rgba(212, 165, 116, 0.3);
  color: #6b472c;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
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

/* Badges */
.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.badge-priority { background: rgba(138, 43, 226, 0.12); color: #8A2BE2; cursor: default; }
.badge-priority.editable { cursor: pointer; }
.badge-priority.editable:hover { background: rgba(138, 43, 226, 0.25); }

.priority-input {
  width: 52px;
  padding: 3px 6px;
  border: 1px solid #D4A574;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  color: #8A2BE2;
  background: #FFF8EF;
  text-align: center;
  outline: none;
  box-shadow: 0 0 0 2px rgba(138, 43, 226, 0.2);
}

.priority-input::-webkit-inner-spin-button,
.priority-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.badge-success { background: rgba(107, 142, 35, 0.12); color: #6B8E23; }
.badge-warning { background: rgba(212, 165, 116, 0.2); color: #A0826D; }
.badge-danger { background: rgba(224, 106, 106, 0.12); color: #E06A6A; }
.badge-info { background: rgba(70, 130, 180, 0.12); color: #4682B4; }
.badge-muted { background: rgba(139, 115, 85, 0.1); color: #8B7355; }

/* Buttons */
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

.btn-remove {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.btn-remove:hover:not(:disabled) {
  background: rgba(224, 106, 106, 0.25);
}

/* Result banner */
.result-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-radius: 8px;
  margin-top: 12px;
  max-width: 400px;
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

.dismiss-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: inherit;
  padding: 0 4px;
  line-height: 1;
}
</style>
