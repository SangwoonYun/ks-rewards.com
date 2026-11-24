<template>
  <div class="admin-page">
    <h1 class="page-title">Dashboard</h1>

    <div v-if="loading" class="loading">Loading...</div>

    <!-- A failed refresh keeps the last data below the error -->
    <div v-if="error" class="result-banner result-error">{{ error }}</div>

    <template v-if="data">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Users</div>
          <div class="stat-value">{{ data.stats.totalUsers }}</div>
          <div class="stat-detail">
            <span class="badge badge-success">{{ data.stats.activeUsers }} active</span>
            <span class="badge badge-muted">{{ data.stats.inactiveUsers }} inactive</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Gift Codes</div>
          <div class="stat-value">{{ data.stats.totalCodes }}</div>
          <div class="stat-detail">
            <span class="badge badge-success">{{ data.stats.validatedCodes }} valid</span>
            <span class="badge badge-warning">{{ data.stats.pendingCodes }} pending</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Code Status</div>
          <div class="stat-value">{{ data.stats.expiredCodes + data.stats.invalidCodes }}</div>
          <div class="stat-detail">
            <span class="badge badge-danger">{{ data.stats.expiredCodes }} expired</span>
            <span class="badge badge-danger">{{ data.stats.invalidCodes }} invalid</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Queue</div>
          <div class="stat-value">{{ data.stats.pendingQueueItems }}</div>
          <div class="stat-detail">
            <span class="badge badge-warning">pending items</span>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">Recent Redemptions</h2>
        <div class="table-wrapper">
          <table class="admin-table">
            <thead>
              <tr>
                <th>FID</th>
                <th></th>
                <th>Nickname</th>
                <th>Code</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in data.recentRedemptions" :key="r.id">
                <td data-label="FID">{{ r.fid }}</td>
                <td class="avatar-cell">
                  <UserAvatar :src="r.avatar_url" :alt="r.nickname || r.fid" class="avatar" />
                </td>
                <td data-label="Nickname">{{ r.nickname || '-' }}</td>
                <td data-label="Code"><code>{{ r.code }}</code></td>
                <td data-label="Status"><span class="badge" :class="redemptionStatusClass(r.status)">{{ r.status }}</span></td>
                <td data-label="Time">{{ formatDateTime(r.redeemed_at) }}</td>
              </tr>
              <tr v-if="data.recentRedemptions.length === 0">
                <td colspan="6" class="empty">No recent redemptions</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  i18n: false,
});

const loading = ref(true);
const data = ref<any>(null);
const error = ref('');

async function fetchDashboard() {
  try {
    data.value = await $fetch('/api/admin/dashboard');
    error.value = '';
  } catch (e: any) {
    console.error('Failed to fetch dashboard:', e);
    error.value = `Failed to load the dashboard: ${e?.data?.message || e?.message || 'Request failed'}`;
  } finally {
    loading.value = false;
  }
}

const { start } = usePolling(fetchDashboard, 30000, { immediate: true });
onMounted(() => start());
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.stat-label {
  margin-bottom: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-3);
}

.stat-value {
  margin-bottom: 12px;
  font-size: 1.875rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.stat-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.section {
  margin-bottom: 32px;
}

/* No infinite scroll here: the list takes its natural height */
.table-wrapper {
  flex: none;
  height: auto;
}

@media (max-width: 720px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 24px;
  }

  .stat-card {
    padding: 14px;
  }

  .stat-value {
    margin-bottom: 8px;
    font-size: 1.5rem;
  }
}
</style>
