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
              <td data-label="FID">{{ pu.fid }}</td>
              <td class="avatar-cell">
                <img :src="pu.avatar_url || '/images/default-avatar.png'" :alt="pu.nickname || pu.fid" class="avatar" referrerpolicy="no-referrer" />
              </td>
              <td data-label="Nickname">{{ pu.nickname || '-' }}</td>
              <td data-label="Kingdom">{{ pu.kingdom || '-' }}</td>
              <td data-label="Priority">
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
              <td data-label="Status">
                <span class="badge" :class="pu.active ? 'badge-success' : 'badge-danger'">
                  {{ pu.active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td data-label="Added">{{ formatDate(pu.added_at) }}</td>
              <td class="actions-cell">
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
              <td data-label="ID">{{ item.id }}</td>
              <td data-label="FID">{{ item.fid }}</td>
              <td class="avatar-cell">
                <img :src="item.avatar_url || '/images/default-avatar.png'" :alt="item.nickname || item.fid" class="avatar" referrerpolicy="no-referrer" />
              </td>
              <td data-label="Nickname">{{ item.nickname || '-' }}</td>
              <td data-label="Code"><code>{{ item.code }}</code></td>
              <td data-label="Priority"><span class="badge badge-priority">{{ item.priority }}</span></td>
              <td data-label="Status"><span class="badge" :class="statusClass(item.status)">{{ item.status }}</span></td>
              <td data-label="Attempts">{{ item.attempts }}</td>
              <td class="error-cell" data-label="Error">{{ item.error_message || '-' }}</td>
              <td data-label="Created">{{ formatDate(item.created_at) }}</td>
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
import type { QueueItem, User, PriorityUser } from '~~/server/utils/db';

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
    if (entries[0]?.isIntersecting) fetchMoreQueue();
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
.page-desc {
  margin: 0 0 12px;
  font-size: 0.875rem;
  color: var(--text-3);
}

.toolbar {
  display: block;
}

/* Dropdown */
.dropdown-wrapper {
  position: relative;
  max-width: 420px;
}

.search-input {
  width: 100%;
}

.dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  max-height: 280px;
  padding: 4px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  cursor: pointer;
}

.dropdown-item:hover {
  background: var(--surface-2);
}

.dropdown-nickname {
  font-weight: 600;
  color: var(--text);
}

.dropdown-fid {
  font-size: 0.8125rem;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.dropdown-badge {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--violet-soft);
  color: var(--violet-text);
  font-size: 0.75rem;
  font-weight: 600;
}

.dropdown-empty {
  padding: 12px;
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-3);
}

.result-banner {
  max-width: 420px;
  margin: 12px 0 0;
}

.badge-priority {
  cursor: default;
}

.badge-priority.editable {
  cursor: pointer;
}

.badge-priority.editable:hover {
  background: var(--violet-soft-2);
}

.priority-input {
  width: 60px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--violet-text);
  font-size: 0.875rem;
  font-weight: 600;
  text-align: center;
  outline: none;
  box-shadow: var(--ring);
}

.priority-input::-webkit-inner-spin-button,
.priority-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

@media (max-width: 720px) {
  .dropdown-wrapper,
  .result-banner {
    max-width: none;
  }

  .priority-input {
    height: 34px;
    font-size: 16px;
  }
}
</style>
