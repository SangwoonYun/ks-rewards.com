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

    <ResultBanner :flash="flash" @dismiss="clearMessage" />

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
import type { GiftCode } from '~~/server/db';

definePageMeta({
  layout: 'admin',
});

const search = ref('');
const statusFilter = ref('');
const stats = ref<any>(null);
const showAddForm = ref(false);
const newCode = ref('');
const adding = ref(false);
const deleting = ref<string | null>(null);
const revalidatingCode = ref<string | null>(null);
const validating = ref(false);
const revalidating = ref(false);
const syncing = ref(false);
const { flash, show: showMessage, clear: clearMessage } = useFlash();

const {
  items: codes,
  total: totalCodes,
  hasMore,
  loading,
  refresh: fetchCodes,
  rootRef: tableWrapperRef,
  sentinelRef,
} = usePaginatedList<GiftCode>('/api/admin/codes', {
  itemsKey: 'codes',
  params: () => {
    const params: Record<string, string> = {};
    if (search.value.trim()) params.search = search.value.trim();
    if (statusFilter.value) params.status = statusFilter.value;
    return params;
  },
  onResponse: (res) => { if (res.stats) stats.value = res.stats; },
});

const debouncedFetch = useDebounceFn(fetchCodes, 300);

async function addCode() {
  if (!newCode.value.trim()) return;
  adding.value = true;
  clearMessage();
  try {
    await $fetch('/api/admin/codes', {
      method: 'POST',
      body: { code: newCode.value.trim(), source: 'admin' },
    });
    showMessage(true, `Code "${newCode.value.trim()}" added successfully`);
    newCode.value = '';
    showAddForm.value = false;
    fetchCodes();
  } catch (e: any) {
    showMessage(false, e?.data?.message || 'Failed to add code');
  } finally {
    adding.value = false;
  }
}

async function deleteCode(code: string) {
  if (!confirm(`Delete code "${code}"?`)) return;
  deleting.value = code;
  try {
    await $fetch(`/api/admin/codes/${encodeURIComponent(code)}/delete`, { method: 'POST' });
    // Drop the row and count it out, so the next page starts at the right offset
    const idx = codes.value.findIndex(c => c.code === code);
    const removed = codes.value[idx];
    if (removed) {
      codes.value.splice(idx, 1);
      totalCodes.value--;
      if (stats.value && typeof stats.value[removed.validation_status] === 'number') stats.value[removed.validation_status]--;
    }
    showMessage(true, `Code "${code}" deleted`);
  } catch (e: any) {
    showMessage(false, e?.data?.message || 'Failed to delete code');
  } finally {
    deleting.value = null;
  }
}

async function revalidateCode(code: string) {
  revalidatingCode.value = code;
  clearMessage();
  try {
    const res: any = await $fetch(`/api/admin/codes/${encodeURIComponent(code)}/revalidate`, { method: 'POST' });
    const statusChanged = res.previousStatus !== res.currentStatus;
    showMessage(
      res.currentStatus === 'validated',
      statusChanged
        ? `Code "${code}": ${res.previousStatus} → ${res.currentStatus}`
        : `Code "${code}": still ${res.currentStatus}`,
    );
    const idx = codes.value.findIndex(c => c.code === code);
    const existing = codes.value[idx];
    if (existing) codes.value[idx] = { ...existing, validation_status: res.currentStatus };
    if (res.stats) stats.value = res.stats;
  } catch (e: any) {
    showMessage(false, e?.data?.message || `Failed to revalidate "${code}"`);
  } finally {
    revalidatingCode.value = null;
  }
}

async function triggerRevalidateInvalid() {
  revalidating.value = true;
  clearMessage();
  try {
    const res: any = await $fetch('/api/admin/codes/revalidate-invalid', { method: 'POST' });
    showMessage(true, `Revalidation complete: ${res.restored ?? 0} restored, ${res.stillInvalid ?? 0} still invalid, ${res.transient ?? 0} skipped (transient)`);
    fetchCodes();
  } catch (e: any) {
    showMessage(false, e?.data?.message || 'Revalidation failed');
  } finally {
    revalidating.value = false;
  }
}

async function triggerSync() {
  syncing.value = true;
  clearMessage();
  try {
    const res: any = await $fetch('/api/admin/codes/sync', { method: 'POST' });
    showMessage(true, `Sync complete: ${res.newCodes ?? 0} new, ${res.existingCodes ?? 0} existing`);
    fetchCodes();
  } catch (e: any) {
    showMessage(false, e?.data?.message || 'Sync failed');
  } finally {
    syncing.value = false;
  }
}

async function triggerValidation() {
  validating.value = true;
  clearMessage();
  try {
    const res: any = await $fetch('/api/admin/codes/validate', { method: 'POST' });
    showMessage(true, `Validation complete: ${res.processed || 0} processed, ${res.valid || 0} valid, ${res.invalid || 0} invalid`);
    fetchCodes();
  } catch (e: any) {
    showMessage(false, e?.data?.message || 'Validation failed');
  } finally {
    validating.value = false;
  }
}

onMounted(fetchCodes);
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
