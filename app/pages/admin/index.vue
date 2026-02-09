<template>
  <div class="admin-page">
    <h1 class="page-title">Dashboard</h1>

    <div v-if="loading" class="loading">Loading...</div>

    <template v-else-if="data">
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
                <th>Nickname</th>
                <th>Code</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in data.recentRedemptions" :key="r.id">
                <td>{{ r.fid }}</td>
                <td>{{ r.nickname || '-' }}</td>
                <td><code>{{ r.code }}</code></td>
                <td><span class="badge" :class="statusClass(r.status)">{{ r.status }}</span></td>
                <td>{{ formatDate(r.redeemed_at) }}</td>
              </tr>
              <tr v-if="data.recentRedemptions.length === 0">
                <td colspan="5" class="empty">No recent redemptions</td>
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
  middleware: ['admin'],
});

const loading = ref(true);
const data = ref<any>(null);

async function fetchDashboard() {
  try {
    data.value = await $fetch('/api/admin/dashboard');
  } catch (e) {
    console.error('Failed to fetch dashboard:', e);
  } finally {
    loading.value = false;
  }
}

function statusClass(status: string) {
  const s = status.toUpperCase();
  if (['SUCCESS', 'RECEIVED'].includes(s)) return 'badge-success';
  if (s.includes('PENDING')) return 'badge-warning';
  return 'badge-danger';
}

function formatDate(d: string) {
  return new Date(d).toLocaleString();
}

let interval: ReturnType<typeof setInterval>;
onMounted(() => {
  fetchDashboard();
  interval = setInterval(fetchDashboard, 30000);
});
onUnmounted(() => clearInterval(interval));
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

.loading {
  text-align: center;
  padding: 40px;
  color: #8B7355;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(92, 74, 53, 0.08);
}

.stat-label {
  font-size: 0.8rem;
  color: #8B7355;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #6b472c;
  margin-bottom: 8px;
}

.stat-detail {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 1.1rem;
  color: #6b472c;
  margin: 0 0 16px;
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

.badge-warning {
  background: rgba(212, 165, 116, 0.2);
  color: #A0826D;
}

.badge-danger {
  background: rgba(224, 106, 106, 0.12);
  color: #E06A6A;
}

.badge-muted {
  background: rgba(139, 115, 85, 0.1);
  color: #8B7355;
}
</style>
