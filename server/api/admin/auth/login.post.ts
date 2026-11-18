import crypto from 'crypto';
import { signAdminToken, COOKIE_NAME } from '../../../utils/jwt';
import { config } from '../../../utils/config';
import { logger } from '../../../utils/logger';

// Failed logins per client IP: after MAX_FAILURES within the window, further attempts are refused until it ends
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

// Constant-time comparison (hashing first makes the lengths equal)
function safeEqual(a: unknown, b: string): boolean {
  const hash = (s: string) => crypto.createHash('sha256').update(s).digest();
  return typeof a === 'string' && crypto.timingSafeEqual(hash(a), hash(b));
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const { username, password } = body ?? {};

  if (!config.admin.username || !config.admin.password) {
    logger.error('Admin credentials not configured in environment variables');
    throw createError({ statusCode: 500, message: 'Admin not configured' });
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  const now = Date.now();
  const record = failures.get(ip);
  if (record && now - record.since > FAILURE_WINDOW_MS) failures.delete(ip);
  if ((failures.get(ip)?.count ?? 0) >= MAX_FAILURES) {
    throw createError({ statusCode: 429, message: 'Too many failed attempts, try again later' });
  }

  // Both compared every time, so the response time does not tell which one was wrong
  const userOk = safeEqual(username, config.admin.username);
  const passwordOk = safeEqual(password, config.admin.password);
  if (!userOk || !passwordOk) {
    const current = failures.get(ip) ?? { count: 0, since: now };
    failures.set(ip, { count: current.count + 1, since: current.since });
    logger.warn(`Failed admin login attempt from ${ip} for username: ${String(username)}`);
    throw createError({ statusCode: 401, message: 'Invalid credentials' });
  }
  failures.delete(ip);

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
