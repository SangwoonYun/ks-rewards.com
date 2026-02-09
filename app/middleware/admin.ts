export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/admin/login') {
    return;
  }

  const { checkAuth } = useAdmin();
  const authenticated = await checkAuth();

  if (!authenticated) {
    return navigateTo('/admin/login');
  }
});
