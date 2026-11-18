// Every admin page except the login page needs a session
export default defineNuxtRouteMiddleware(async (to) => {
  const isAdminPage = to.path === '/admin' || to.path.startsWith('/admin/');
  if (!isAdminPage || to.path === '/admin/login') {
    return;
  }

  const { checkAuth } = useAdmin();
  const authenticated = await checkAuth();

  if (!authenticated) {
    return navigateTo('/admin/login');
  }
});
