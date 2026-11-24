<template>
  <div class="login-wrapper">
    <div class="login-card">
      <BrandMark :size="44" class="login-logo" />
      <h1 class="login-title">KS Admin</h1>
      <p class="login-subtitle">Sign in to continue</p>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            placeholder="Enter username"
            autocomplete="username"
            required
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="Enter password"
            autocomplete="current-password"
            required
          />
        </div>

        <div v-if="error" class="login-error">{{ error }}</div>

        <button type="submit" class="login-btn" :disabled="isLogging">
          {{ isLogging ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  i18n: false,
});

const { login, checkAuth } = useAdmin();

const username = ref('');
const password = ref('');
const error = ref('');
const isLogging = ref(false);

onMounted(async () => {
  const authed = await checkAuth();
  if (authed) {
    navigateTo('/admin');
  }
});

async function handleLogin() {
  error.value = '';
  isLogging.value = true;

  try {
    await login(username.value, password.value);
    navigateTo('/admin');
  } catch (e: any) {
    error.value = e?.data?.message || 'Invalid credentials';
  } finally {
    isLogging.value = false;
  }
}
</script>

<style scoped>
.login-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 20px 16px;
  background: var(--bg);
}

.login-card {
  width: 100%;
  max-width: 380px;
  padding: 32px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.login-logo {
  margin: 0 auto 16px;
}

.login-title {
  margin: 0 0 4px;
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}

.login-subtitle {
  margin: 0 0 28px;
  font-size: 0.875rem;
  color: var(--text-3);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-2);
}

.form-group input {
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font-size: 16px;
  box-shadow: var(--shadow-xs);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-group input::placeholder {
  color: var(--text-4);
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--ring);
}

.login-error {
  padding: 10px 12px;
  background: var(--danger-soft);
  border: 1px solid #fecaca;
  border-radius: var(--radius);
  color: var(--danger-text);
  font-size: 0.875rem;
}

.login-btn {
  height: 44px;
  margin-top: 4px;
  border: none;
  border-radius: var(--radius);
  background: var(--primary);
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  transition: background-color 0.15s ease;
}

.login-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .login-card {
    padding: 28px 20px;
  }
}
</style>
