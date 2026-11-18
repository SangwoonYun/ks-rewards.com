import type { H3Event } from 'h3';
import { parseFid } from './player';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * limit/offset query parameters (limit defaults to 50, at most 200)
 */
export function getPagination(event: H3Event, defaultLimit = DEFAULT_PAGE_SIZE) {
  const query = getQuery(event);
  const limit = parseInt(String(query.limit), 10);
  const offset = parseInt(String(query.offset), 10);
  return {
    limit: Math.min(limit > 0 ? limit : defaultLimit, MAX_PAGE_SIZE),
    offset: offset > 0 ? offset : 0
  };
}

/**
 * The fid route parameter, or a 400 error
 */
export function requireFidParam(event: H3Event): string {
  const fid = getRouterParam(event, 'fid');
  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }
  return fid;
}

/**
 * The fids array of a request body (numeric strings, duplicates dropped), or a 400 error when missing or empty
 */
export function requireFidList(body: unknown): string[] {
  const list = (body as { fids?: unknown } | null)?.fids;
  const fids = Array.isArray(list) ? list.map(parseFid) : [];
  if (fids.length === 0 || fids.some(fid => fid === null)) {
    throw createError({ statusCode: 400, message: 'fids must be a non-empty list of numeric FIDs' });
  }
  return [...new Set(fids as string[])];
}
