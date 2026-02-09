<template>
  <div class="admin-page">
    <h1 class="page-title">Gift Code Management</h1>

    <div class="toolbar">
      <input
        v-model="search"
        type="text"
        class="search-input"
        placeholder="Search by code..."
        @input="debouncedFetch"
      />
      <select v-model="statusFilter" class="filter-select" @change="fetchCodes">
        <option value="">All</option>
        <option value="validated">Validated</option>
        <option value="pending">Pending</option>
        <option value="expired">Expired</option>
        <option value="invalid">Invalid</option>
      </select>
      <button class="toolbar-btn btn-primary" @click="showAddForm = !showAddForm">
        {{ showAddForm ? 'Cancel' : '+ Add Code' }}
      </button>
      <button class="toolbar-btn btn-secondary" :disabled="validating" @click="triggerValidation">
        {{ validating ? 'Validating...' : 'Validate Pending' }}
      </button>
    </div>

    <div v-if="showAddForm" class="add-form">
      <input
        v-model="newCode"
        type="text"
        class="search-input"
        placeholder="Enter gift code..."
        @keyup.enter="addCode"
      />
      <button class="toolbar-btn btn-primary" :disabled="!newCode.trim() || adding" @click="addCode">
        {{ adding ? 'Adding...' : 'Add' }}
      </button>
    </div>

    <div v-if="message" class="message" :class="messageType">{{ message }}</div>

    <div class="info-bar">
      <span>{{ codes.length }} codes</span>
      <span v-if="stats" class="stats-summary">
        ({{ stats.validated }} valid, {{ stats.pending }} pending, {{ stats.expired }} expired, {{ stats.invalid }} invalid)
      </span>
    </div>

    <div class="table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Source</th>
            <th>Discovered</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="code in codes" :key="code.code">
            <td><code>{{ code.code }}</code></td>
            <td>
              <span class="badge" :class="codeStatusClass(code.validation_status)">
                {{ code.validation_status }}
              </span>
            </td>
            <td>{{ code.source }}</td>
            <td>{{ formatDate(code.date_discovered) }}</td>
            <td>
              <button
                class="action-btn btn-delete"
                :disabled="deleting === code.code"
                @click="deleteCode(code.code)"
              >
                Delete
              </button>
            </td>
          </tr>
          <tr v-if="codes.length === 0 && !loading">
            <td colspan="5" class="empty">No codes found</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
  </div>
</template>

<script setup lang="ts">
import type { GiftCode } from '~/server/utils/db';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

const search = ref('');
const statusFilter = ref('');
const codes = ref<GiftCode[]>([]);
const stats = ref<any>(null);
const loading = ref(true);
const showAddForm = ref(false);
const newCode = ref('');
const adding = ref(false);
const deleting = ref<string | null>(null);
const validating = ref(false);
const message = ref('');
const messageType = ref('');

let debounceTimer: ReturnType<typeof setTimeout>;

function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchCodes, 300);
}

async function fetchCodes() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (search.value.trim()) params.search = search.value.trim();
    if (statusFilter.value) params.status = statusFilter.value;

    const res: any = await $fetch('/api/admin/codes', { params });
    codes.value = res.codes;
    stats.value = res.stats;
  } catch (e) {
    console.error('Failed to fetch codes:', e);
  } finally {
    loading.value = false;
  }
}

async function addCode() {
  if (!newCode.value.trim()) return;
  adding.value = true;
  message.value = '';
  try {
    await $fetch('/api/admin/codes', {
      method: 'POST',
      body: { code: newCode.value.trim(), source: 'admin' },
    });
    message.value = `Code "${newCode.value.trim()}" added successfully`;
    messageType.value = 'message-success';
    newCode.value = '';
    showAddForm.value = false;
    fetchCodes();
  } catch (e: any) {
    message.value = e?.data?.message || 'Failed to add code';
    messageType.value = 'message-error';
  } finally {
    adding.value = false;
  }
}

async function deleteCode(code: string) {
  if (!confirm(`Delete code "${code}"?`)) return;
  deleting.value = code;
  try {
    await $fetch(`/api/admin/codes/${code}/delete`, { method: 'POST' });
    codes.value = codes.value.filter(c => c.code !== code);
    message.value = `Code "${code}" deleted`;
    messageType.value = 'message-success';
  } catch (e: any) {
    message.value = e?.data?.message || 'Failed to delete code';
    messageType.value = 'message-error';
  } finally {
    deleting.value = null;
  }
}

async function triggerValidation() {
  validating.value = true;
  message.value = '';
  try {
    const res: any = await $fetch('/api/admin/codes/validate', { method: 'POST' });
    message.value = `Validation complete: ${res.processed || 0} processed, ${res.valid || 0} valid, ${res.invalid || 0} invalid`;
    messageType.value = 'message-success';
    fetchCodes();
  } catch (e: any) {
    message.value = e?.data?.message || 'Validation failed';
    messageType.value = 'message-error';
  } finally {
    validating.value = false;
  }
}

function codeStatusClass(status: string) {
  switch (status) {
    case 'validated': return 'badge-success';
    case 'pending': return 'badge-warning';
    case 'expired': case 'invalid': return 'badge-danger';
    default: return 'badge-muted';
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString();
}

onMounted(fetchCodes);
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

.btn-secondary {
  background: rgba(139, 111, 71, 0.12);
  color: #8B6F47;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(139, 111, 71, 0.22);
}

.add-form {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 10px;
  border: 1px solid rgba(92, 74, 53, 0.08);
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

.message-error {
  background: rgba(224, 106, 106, 0.1);
  color: #E06A6A;
  border: 1px solid rgba(224, 106, 106, 0.2);
}

.info-bar {
  font-size: 0.8rem;
  color: #8B7355;
  margin-bottom: 12px;
}

.stats-summary {
  margin-left: 4px;
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
.badge-muted { background: rgba(139, 115, 85, 0.1); color: #8B7355; }

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

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-delete {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.btn-delete:hover:not(:disabled) {
  background: rgba(224, 106, 106, 0.25);
}
</style>
