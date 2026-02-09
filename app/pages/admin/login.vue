<template>
  <div class="login-wrapper">
    <div class="login-card">
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
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #F3ECE0 0%, #E9DFC8 100%);
  font-family: 'Cinzel', serif;
  padding: 20px;
}

.login-card {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.09);
  border: 1px solid rgba(92, 74, 53, 0.08);
}

.login-title {
  text-align: center;
  color: #6b472c;
  font-size: 1.8rem;
  margin: 0 0 4px;
}

.login-subtitle {
  text-align: center;
  color: #8B7355;
  font-size: 0.9rem;
  margin: 0 0 32px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.85rem;
  color: #5C4A35;
  font-weight: 700;
}

.form-group input {
  padding: 12px 14px;
  border: 1px solid rgba(92, 74, 53, 0.2);
  border-radius: 8px;
  font-size: 0.95rem;
  font-family: inherit;
  color: #5C4A35;
  background: #FFF8EF;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #D4A574;
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15);
}

.login-error {
  background: rgba(224, 106, 106, 0.1);
  color: #E06A6A;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  border: 1px solid rgba(224, 106, 106, 0.2);
}

.login-btn {
  padding: 14px;
  background: linear-gradient(135deg, #6b472c, #7b5a36);
  color: #F5E6D3;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 0.5px;
}

.login-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #7b5a36, #8B6F47);
  box-shadow: 0 4px 12px rgba(107, 71, 44, 0.3);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
