import type { UserFilters } from '../db';

/**
 * The user grid's filters from a query string or request body: search (FID or nickname), status
 * (active/inactive), fid and nickname contain, kingdom exact, registered between from and to (ISO, to exclusive)
 */
export function parseUserFilters(input: Record<string, unknown>): UserFilters {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '');
  const time = (key: string) => {
    const ms = Date.parse(text(key));
    return isNaN(ms) ? undefined : ms;
  };
  const status = text('status');

  return {
    search: text('search') || undefined,
    status: status === 'active' || status === 'inactive' ? status : undefined,
    fid: text('fid') || undefined,
    nickname: text('nickname') || undefined,
    kingdom: text('kingdom') || undefined,
    from: time('from'),
    to: time('to')
  };
}

