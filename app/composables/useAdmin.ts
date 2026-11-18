export function useAdmin() {
  const isAuthenticated = useState<boolean>('admin-auth', () => false);

  async function checkAuth(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (import.meta.server) {
        const cookies = useRequestHeaders(['cookie']);
        if (cookies.cookie) {
          headers.cookie = cookies.cookie;
        }
      }
      await $fetch('/api/admin/auth/me', { headers });
      isAuthenticated.value = true;
      return true;
    } catch {
      isAuthenticated.value = false;
      return false;
    }
  }

  async function login(username: string, password: string): Promise<void> {
    await $fetch('/api/admin/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    isAuthenticated.value = true;
  }

  // Leaves the admin panel even when the request fails (e.g. the session already expired)
  async function logout(): Promise<void> {
    try {
      await $fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout request failed:', e);
    }
    isAuthenticated.value = false;
    navigateTo('/admin/login');
  }

  return { isAuthenticated, checkAuth, login, logout };
}
