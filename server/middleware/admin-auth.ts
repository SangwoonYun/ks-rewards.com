import { verifyAdminToken, COOKIE_NAME } from '../utils/jwt';

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/admin')) {
    return;
  }

  if (pathname === '/api/admin/auth/login') {
    return;
  }

  const token = getCookie(event, COOKIE_NAME);
  if (!token) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const valid = await verifyAdminToken(token);
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Invalid or expired session' });
  }

  event.context.admin = true;
});
