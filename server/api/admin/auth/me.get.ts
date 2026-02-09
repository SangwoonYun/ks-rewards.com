import { verifyAdminToken, COOKIE_NAME } from '../../../utils/jwt';

export default defineEventHandler(async (event) => {
  const token = getCookie(event, COOKIE_NAME);

  if (!token) {
    throw createError({ statusCode: 401, message: 'Not authenticated' });
  }

  const valid = await verifyAdminToken(token);
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Invalid or expired session' });
  }

  return { authenticated: true, role: 'admin' };
});
