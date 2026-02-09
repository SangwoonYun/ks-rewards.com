import { signAdminToken, COOKIE_NAME } from '../../../utils/jwt';
import { config } from '../../../utils/config';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { username, password } = body;

  if (!config.admin.username || !config.admin.password) {
    logger.error('Admin credentials not configured in environment variables');
    throw createError({ statusCode: 500, message: 'Admin not configured' });
  }

  if (username !== config.admin.username || password !== config.admin.password) {
    logger.warn(`Failed admin login attempt for username: ${username}`);
    throw createError({ statusCode: 401, message: 'Invalid credentials' });
  }

  const token = await signAdminToken();

  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });

  logger.info('Admin logged in successfully');
  return { success: true };
});
