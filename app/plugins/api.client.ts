// An expired admin session (HTTP 401 from an admin API) sends the browser to the login page.
// The login and session-check endpoints answer 401 as part of their normal flow, so they are left alone.
const AUTH_PATHS = ['/api/admin/auth/login', '/api/admin/auth/me'];

export default defineNuxtPlugin((nuxtApp) => {
  globalThis.$fetch = $fetch.create({
    onResponseError({ request, response }) {
      if (response.status !== 401) return;
      const { pathname } = new URL(typeof request === 'string' ? request : request.url, window.location.origin);
      if (!pathname.startsWith('/api/admin/') || AUTH_PATHS.includes(pathname)) return;
      nuxtApp.runWithContext(() => navigateTo('/admin/login'));
    },
  }) as typeof $fetch;
});
