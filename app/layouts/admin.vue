<template>
  <div class="admin-wrapper">
    <aside class="admin-sidebar">
      <div class="admin-logo">
        <h2>KS Admin</h2>
      </div>
      <nav class="admin-nav">
        <NuxtLink to="/admin" class="admin-nav-link" :class="{ active: route.path === '/admin' }">
          <span class="nav-icon">&#9632;</span> Dashboard
        </NuxtLink>
        <NuxtLink to="/admin/users" class="admin-nav-link" active-class="active">
          <span class="nav-icon">&#9632;</span> Users
        </NuxtLink>
        <NuxtLink to="/admin/codes" class="admin-nav-link" active-class="active">
          <span class="nav-icon">&#9632;</span> Gift Codes
        </NuxtLink>
        <NuxtLink to="/admin/redemptions" class="admin-nav-link" active-class="active">
          <span class="nav-icon">&#9632;</span> Redemptions
        </NuxtLink>
      </nav>
      <div class="admin-sidebar-footer">
        <NuxtLink to="/" class="admin-nav-link back-link">
          &larr; Back to Site
        </NuxtLink>
        <button class="admin-logout-btn" @click="logout">          Logout
        </button>
      </div>
    </aside>
    <main class="admin-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const { logout } = useAdmin();
</script>

<style scoped>
.admin-wrapper {
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #F3ECE0 0%, #E9DFC8 100%);
  font-family: 'Cinzel', serif;
}

.admin-sidebar {
  width: 250px;
  background: linear-gradient(180deg, #6b472c 0%, #7b5a36 100%);
  color: #F5E6D3;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  box-shadow: 4px 0 12px rgba(0,0,0,0.15);
}

.admin-logo {
  padding: 24px 20px;
  border-bottom: 1px solid rgba(245, 230, 211, 0.15);
}

.admin-logo h2 {
  margin: 0;
  font-size: 1.4rem;
  color: #D4A574;
  letter-spacing: 1px;
}

.admin-nav {
  flex: 1;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  color: rgba(245, 230, 211, 0.75);
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.admin-nav-link:hover {
  background: rgba(245, 230, 211, 0.08);
  color: #F5E6D3;
}

.admin-nav-link.active {
  background: rgba(245, 230, 211, 0.12);
  color: #D4A574;
  border-left-color: #D4A574;
}

.nav-icon {
  font-size: 0.5rem;
  opacity: 0.6;
}

.admin-sidebar-footer {
  padding: 16px 0;
  border-top: 1px solid rgba(245, 230, 211, 0.15);
}

.back-link {
  font-size: 0.85rem;
}

.admin-logout-btn {
  display: block;
  width: calc(100% - 40px);
  margin: 8px 20px 0;
  padding: 10px;
  background: rgba(224, 106, 106, 0.2);
  color: #E06A6A;
  border: 1px solid rgba(224, 106, 106, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-family: 'Cinzel', serif;
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.admin-logout-btn:hover {
  background: rgba(224, 106, 106, 0.35);
}

.admin-main {
  flex: 1;
  margin-left: 250px;
  padding: 32px;
  min-height: 100vh;
}

@media (max-width: 768px) {
  .admin-sidebar {
    width: 200px;
  }
  .admin-main {
    margin-left: 200px;
    padding: 20px;
  }
}
</style>
