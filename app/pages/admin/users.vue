<template>
  <div class="admin-page">
    <h1 class="page-title">User Management</h1>

    <div class="toolbar">
      <input
        v-model="search"
        type="text"
        class="search-input"
        placeholder="Search by FID or nickname..."
        @input="debouncedFetch"
      />
      <select v-model="statusFilter" class="filter-select" @change="fetchUsers">
        <option value="">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <button
        class="action-btn btn-apply-all"
        :disabled="applyingAll"
        @click="applyAllCodes"
      >
        {{ applyingAll ? 'Applying...' : 'Apply All Codes' }}
      </button>
    </div>

    <div v-if="applyAllResult" class="result-banner" :class="applyAllResult.success ? 'result-success' : 'result-error'">
      {{ applyAllResult.message }}
      <button class="dismiss-btn" @click="applyAllResult = null">&times;</button>
    </div>

    <div class="info-bar">
      <span>{{ users.length }} users found</span>
    </div>

    <div class="table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th>FID</th>
            <th>Nickname</th>
            <th>Kingdom</th>
            <th>Status</th>
            <th>Registered</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.fid">
            <td>{{ user.fid }}</td>
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
              <span v-if="applyResults[user.fid]" class="apply-result" :class="applyResults[user.fid].success ? 'text-success' : 'text-error'">
                {{ applyResults[user.fid].message }}
              </span>
            </td>
          </tr>
          <tr v-if="users.length === 0 && !loading">
            <td colspan="6" class="empty">No users found</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
  </div>
</template>

<script setup lang="ts">
import type { User } from '~/server/utils/db';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

const search = ref('');
const statusFilter = ref('');
const users = ref<User[]>([]);
const loading = ref(true);
const toggling = ref<string | null>(null);
const applying = ref<string | null>(null);
const applyResults = ref<Record<string, { success: boolean; message: string }>>({});
const applyingAll = ref(false);
const applyAllResult = ref<{ success: boolean; message: string } | null>(null);

let debounceTimer: ReturnType<typeof setTimeout>;

function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchUsers, 300);
}

async function fetchUsers() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (search.value.trim()) params.search = search.value.trim();
    if (statusFilter.value) params.status = statusFilter.value;

    const res = await $fetch('/api/admin/users', { params });
    users.value = (res as any).users;
  } catch (e) {
    console.error('Failed to fetch users:', e);
  } finally {
    loading.value = false;
  }
}

async function toggleUser(user: User) {
  toggling.value = user.fid;
  try {
    await $fetch(`/api/admin/users/${user.fid}/toggle`, { method: 'POST' });
    user.active = user.active === 1 ? 0 : 1;
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
  if (!confirm('Apply all validated gift codes to all active users? This may take a while.')) return;

  applyingAll.value = true;
  applyAllResult.value = null;
  try {
    const res = await $fetch('/api/admin/users/apply-all', { method: 'POST' }) as any;
    applyAllResult.value = {
      success: res.success,
      message: res.queuedCount === 0
        ? 'No unredeemed codes to apply'
        : `Queued ${res.queuedCount}, processed ${res.processed} (${res.successCount} success, ${res.failedCount} failed)`,
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

onMounted(fetchUsers);
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

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 200px;
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

.filter-select {
  padding: 10px 14px;
  border: 1px solid rgba(92, 74, 53, 0.2);
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.9rem;
  color: #5C4A35;
  background: #FFF8EF;
  cursor: pointer;
}

.info-bar {
  font-size: 0.8rem;
  color: #8B7355;
  margin-bottom: 12px;
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

.btn-apply-all {
  background: rgba(70, 130, 180, 0.15);
  color: #4682B4;
  padding: 10px 18px;
  font-size: 0.85rem;
}

.btn-apply-all:hover:not(:disabled) {
  background: rgba(70, 130, 180, 0.3);
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
