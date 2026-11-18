<template>
  <div class="admin-wrapper">
    <header class="admin-topbar">
      <button class="menu-btn" aria-label="Open menu" :aria-expanded="menuOpen" @click="menuOpen = true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <span class="admin-brand"><span class="brand-mark">KS</span> Admin</span>
    </header>

    <div v-if="menuOpen" class="admin-backdrop" @click="menuOpen = false" />

    <aside class="admin-sidebar" :class="{ open: menuOpen }">
      <div class="admin-logo">
        <span class="admin-brand"><span class="brand-mark">KS</span> Admin</span>
        <button class="menu-btn close-btn" aria-label="Close menu" @click="menuOpen = false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <nav class="admin-nav">
        <NuxtLink
          v-for="item in NAV_ITEMS"
          :key="item.to"
          :to="item.to"
          class="admin-nav-link"
          :class="{ active: item.exact ? route.path === item.to : route.path.startsWith(item.to) }"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg>
          {{ item.label }}
          <span
            v-if="item.to === FAILURES_PATH && failureCount > 0"
            class="nav-badge"
            :aria-label="`${failureCount} users with failures`"
          >{{ failureCount > 99 ? '99+' : failureCount }}</span>
        </NuxtLink>
      </nav>
      <div class="admin-sidebar-footer">
        <NuxtLink to="/" class="admin-nav-link">
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Back to Site
        </NuxtLink>
        <button class="admin-nav-link admin-logout-btn" @click="logout">
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Logout
        </button>
      </div>
    </aside>

    <main class="admin-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import '~/assets/css/admin.css';

const route = useRoute();
const { logout } = useAdmin();

// Icon paths are 24x24 stroke outlines
const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', exact: true, icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { to: '/admin/codes', label: 'Gift Codes', exact: false, icon: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z' },
  { to: '/admin/redemptions', label: 'Redemptions', exact: false, icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { to: '/admin/users', label: 'Users', exact: false, icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { to: '/admin/redemption-failures', label: 'Redemption Failures', exact: false, icon: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
  { to: '/admin/priority', label: 'Priority Queue', exact: false, icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
];

// The mobile drawer closes after navigating
const menuOpen = ref(false);
watch(() => route.path, () => { menuOpen.value = false; });

// Failure count badge: refreshed in the background, apart from page loads (see useFailureCount);
// the failures page also updates it from its own list
const FAILURES_PATH = '/admin/redemption-failures';
const { count: failureCount, startPolling } = useFailureCount();
let stopPolling: (() => void) | null = null;
onMounted(() => { stopPolling = startPolling(); });
onBeforeUnmount(() => stopPolling?.());
</script>

<style scoped>
.admin-wrapper {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
}

/* Sidebar */
.admin-sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  width: 240px;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.admin-logo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--border);
}

.admin-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius);
  background: var(--primary);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0;
}

.admin-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  overflow-y: auto;
}

.admin-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.admin-nav-link:hover {
  background: var(--surface-2);
  color: var(--text);
}

.admin-nav-link.active {
  background: var(--primary-soft);
  color: var(--primary-text);
  font-weight: 600;
}

.nav-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: auto;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.admin-sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.admin-logout-btn {
  color: var(--danger-text);
}

.admin-logout-btn:hover {
  background: var(--danger-soft);
  color: var(--danger-text);
}

/* Main */
.admin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  margin-left: 240px;
  padding: 28px 32px;
  overflow-y: auto;
}

/* Mobile top bar and drawer (hidden on desktop) */
.admin-topbar,
.menu-btn.close-btn,
.admin-backdrop {
  display: none;
}

.menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

.menu-btn:hover {
  background: var(--surface-2);
}

.menu-btn svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

@media (max-width: 1024px) {
  .admin-wrapper {
    flex-direction: column;
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }

  .admin-topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 56px;
    padding: 0 12px 0 8px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: saturate(180%) blur(8px);
    -webkit-backdrop-filter: saturate(180%) blur(8px);
    border-bottom: 1px solid var(--border);
  }

  .admin-sidebar {
    width: min(280px, 85vw);
    box-shadow: var(--shadow-md);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }

  .admin-sidebar.open {
    transform: translateX(0);
  }

  .menu-btn.close-btn {
    display: inline-flex;
  }

  .admin-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(17, 24, 39, 0.4);
  }

  .admin-main {
    margin-left: 0;
    padding: 20px 16px 32px;
    overflow: visible;
  }
}
</style>
