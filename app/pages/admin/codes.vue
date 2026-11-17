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
      <button class="toolbar-btn btn-info" :disabled="syncing" @click="triggerSync">
        {{ syncing ? 'Syncing...' : 'Sync Now' }}
      </button>
      <button class="toolbar-btn btn-primary" @click="showAddForm = !showAddForm">
        {{ showAddForm ? 'Cancel' : '+ Add Code' }}
      </button>
      <button class="toolbar-btn btn-secondary" :disabled="validating" @click="triggerValidation">
        {{ validating ? 'Validating...' : 'Validate Pending' }}
      </button>
      <button class="toolbar-btn btn-warn" :disabled="revalidating" @click="triggerRevalidateInvalid">
        {{ revalidating ? 'Revalidating...' : 'Revalidate Invalid' }}
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
      <span>{{ codes.length }} / {{ totalCodes }} codes</span>
      <span v-if="stats" class="stats-summary">
        ({{ stats.validated }} valid, {{ stats.pending }} pending, {{ stats.expired }} expired, {{ stats.invalid }} invalid)
      </span>
    </div>

    <div ref="tableWrapperRef" class="table-wrapper">
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
            <td data-label="Code"><code>{{ code.code }}</code></td>
            <td data-label="Status">
              <span class="badge" :class="codeStatusClass(code.validation_status)">
                {{ code.validation_status }}
              </span>
            </td>
            <td data-label="Source">{{ code.source }}</td>
            <td data-label="Discovered">{{ formatDate(code.date_discovered) }}</td>
            <td class="actions-cell">
              <button
                class="action-btn btn-revalidate"
                :disabled="revalidatingCode === code.code"
                @click="revalidateCode(code.code)"
              >
                {{ revalidatingCode === code.code ? '...' : 'Revalidate' }}
              </button>
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
          <tr v-if="hasMore">
            <td colspan="5" class="sentinel-cell">
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
import type { GiftCode } from '~~/server/utils/db';

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
});

const PAGE_SIZE = 50;

const search = ref('');
const statusFilter = ref('');
const codes = ref<GiftCode[]>([]);
const totalCodes = ref(0);
const hasMore = ref(false);
const offset = ref(0);
const sentinelRef = ref<HTMLElement | null>(null);
const tableWrapperRef = ref<HTMLElement | null>(null);
const stats = ref<any>(null);
const loading = ref(true);
const showAddForm = ref(false);
const newCode = ref('');
const adding = ref(false);
const deleting = ref<string | null>(null);
const revalidatingCode = ref<string | null>(null);
const validating = ref(false);
const revalidating = ref(false);
const syncing = ref(false);
const message = ref('');
const messageType = ref('');

let debounceTimer: ReturnType<typeof setTimeout>;

function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchCodes, 300);
}

async function fetchCodes() {
  loading.value = true;
  offset.value = 0;
  codes.value = [];
  try {
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: '0' };
    if (search.value.trim()) params.search = search.value.trim();
    if (statusFilter.value) params.status = statusFilter.value;

    const res: any = await $fetch('/api/admin/codes', { params });
    codes.value = res.codes;
    totalCodes.value = res.total;
    hasMore.value = res.hasMore;
    offset.value = res.codes.length;
    stats.value = res.stats;
  } catch (e) {
    console.error('Failed to fetch codes:', e);
  } finally {
    loading.value = false;
  }
}

async function fetchMoreCodes() {
  if (loading.value || !hasMore.value) return;
  loading.value = true;
  try {
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(offset.value) };
    if (search.value.trim()) params.search = search.value.trim();
    if (statusFilter.value) params.status = statusFilter.value;

    const res: any = await $fetch('/api/admin/codes', { params });
    codes.value.push(...res.codes);
    totalCodes.value = res.total;
    hasMore.value = res.hasMore;
    offset.value += res.codes.length;
  } catch (e) {
    console.error('Failed to fetch more codes:', e);
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

async function revalidateCode(code: string) {
  revalidatingCode.value = code;
  message.value = '';
  try {
    const res: any = await $fetch(`/api/admin/codes/${encodeURIComponent(code)}/revalidate`, { method: 'POST' });
    const statusChanged = res.previousStatus !== res.currentStatus;
    message.value = statusChanged
      ? `Code "${code}": ${res.previousStatus} → ${res.currentStatus}`
      : `Code "${code}": still ${res.currentStatus}`;
    messageType.value = res.currentStatus === 'validated' ? 'message-success' : 'message-error';
    const idx = codes.value.findIndex(c => c.code === code);
    const existing = codes.value[idx];
    if (existing) codes.value[idx] = { ...existing, validation_status: res.currentStatus };
    const statsRes: any = await $fetch('/api/admin/codes', { params: { limit: '1', offset: '0' } });
    if (statsRes.stats) stats.value = statsRes.stats;
  } catch (e: any) {
    message.value = e?.data?.message || `Failed to revalidate "${code}"`;
    messageType.value = 'message-error';
  } finally {
    revalidatingCode.value = null;
  }
}

async function triggerRevalidateInvalid() {
  revalidating.value = true;
  message.value = '';
  try {
    const res: any = await $fetch('/api/admin/codes/revalidate-invalid', { method: 'POST' });
    message.value = `Revalidation complete: ${res.restored ?? 0} restored, ${res.stillInvalid ?? 0} still invalid, ${res.transient ?? 0} skipped (transient)`;
    messageType.value = 'message-success';
    fetchCodes();
  } catch (e: any) {
    message.value = e?.data?.message || 'Revalidation failed';
    messageType.value = 'message-error';
  } finally {
    revalidating.value = false;
  }
}

async function triggerSync() {
  syncing.value = true;
  message.value = '';
  try {
    const res: any = await $fetch('/api/admin/codes/sync', { method: 'POST' });
    message.value = `Sync complete: ${res.newCodes ?? 0} new, ${res.existingCodes ?? 0} existing`;
    messageType.value = 'message-success';
    fetchCodes();
  } catch (e: any) {
    message.value = e?.data?.message || 'Sync failed';
    messageType.value = 'message-error';
  } finally {
    syncing.value = false;
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

let observer: IntersectionObserver | null = null;

watch(sentinelRef, (el) => {
  if (observer) observer.disconnect();
  if (!el || !tableWrapperRef.value) return;
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) fetchMoreCodes();
  }, { root: tableWrapperRef.value, threshold: 0 });
  observer.observe(el);
});

onMounted(fetchCodes);

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<style scoped>
.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.stats-summary {
  margin-left: 4px;
}

@media (max-width: 720px) {
  .toolbar .filter-select {
    flex: 1;
  }

  .toolbar .toolbar-btn {
    flex: 1 1 calc(50% - 4px);
  }

  .add-form {
    flex-wrap: wrap;
  }

  .add-form .toolbar-btn {
    flex: 1;
  }
}
</style>
