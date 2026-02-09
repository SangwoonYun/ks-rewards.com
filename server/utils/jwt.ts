import { SignJWT, jwtVerify } from 'jose';
import { config } from './config';

export const COOKIE_NAME = 'ks-admin-token';
const TOKEN_EXPIRY = '24h';

function getSecret(): Uint8Array {
  return new TextEncoder().encode(config.admin.jwtSecret);
}

export async function signAdminToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .setSubject(config.admin.username)
    .sign(getSecret());
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.role === 'admin' && payload.sub === config.admin.username;
  } catch {
    return false;
  }
}
