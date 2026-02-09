export function useAdmin() {
  const isAuthenticated = useState<boolean>('admin-auth', () => false);
  const isLoading = useState<boolean>('admin-loading', () => true);

  async function checkAuth(): Promise<boolean> {
    try {
      await $fetch('/api/admin/auth/me');
      isAuthenticated.value = true;
      return true;
    } catch {
      isAuthenticated.value = false;
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function login(username: string, password: string): Promise<void> {
    await $fetch('/api/admin/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    isAuthenticated.value = true;
  }

  async function logout(): Promise<void> {
    await $fetch('/api/admin/auth/logout', { method: 'POST' });
    isAuthenticated.value = false;
    navigateTo('/admin/login');
  }

  return { isAuthenticated, isLoading, checkAuth, login, logout };
}
