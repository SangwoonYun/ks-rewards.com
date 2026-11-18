import { db } from './connection';
import { stmt, utc, sqliteNow } from './sql';

export interface User {
  fid: string;
  nickname: string | null;
  kingdom: string | null;
  avatar_url: string | null;
  active: number;
  kingdom_verified_at: string | null;   // last time the fid/kid pair was accepted by the API
  created_at: string;
  updated_at: string;
}

export interface UserFilters {
  search?: string;     // FID or nickname contains (case-insensitive)
  status?: 'active' | 'inactive';
  fid?: string;        // contains
  nickname?: string;   // contains (case-insensitive)
  kingdom?: string;    // exact
  from?: number;       // registered at or after (epoch ms)
  to?: number;         // registered before (epoch ms)
}

export type UserSortKey = 'fid' | 'nickname' | 'kingdom' | 'active' | 'created_at';

// Sort expressions: fid and kingdom compare as numbers; missing values always go last
const SORT_EXPRESSIONS: Record<UserSortKey, string> = {
  fid: 'CAST(fid AS INTEGER)',
  nickname: "NULLIF(js_lower(nickname), '')",
  kingdom: "CAST(NULLIF(kingdom, '') AS INTEGER)",
  active: 'active',
  created_at: 'created_at'
};

const COLUMNS = `fid, nickname, kingdom, avatar_url, active, kingdom_verified_at, ${utc('created_at')}, ${utc('updated_at')}`;

function whereClause(filters: UserFilters): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status === 'active') conditions.push('active = 1');
  else if (filters.status === 'inactive') conditions.push('active = 0');

  if (filters.search) {
    conditions.push('(instr(js_lower(fid), ?) > 0 OR instr(js_lower(nickname), ?) > 0)');
    params.push(filters.search.toLowerCase(), filters.search.toLowerCase());
  }
  if (filters.fid) {
    conditions.push('instr(fid, ?) > 0');
    params.push(filters.fid);
  }
  if (filters.nickname) {
    conditions.push('instr(js_lower(nickname), ?) > 0');
    params.push(filters.nickname.toLowerCase());
  }
  if (filters.kingdom) {
    conditions.push('kingdom = ?');
    params.push(filters.kingdom);
  }
  if (filters.from !== undefined) {
    conditions.push('created_at >= ?');
    params.push(sqliteNow(new Date(filters.from)));
  }
  if (filters.to !== undefined) {
    conditions.push('created_at < ?');
    params.push(sqliteNow(new Date(filters.to)));
  }

  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export const users = {
  create: (fid: string, nickname: string | null = null, active: number = 1) => {
    return stmt(`
      INSERT INTO users (fid, nickname, active)
      VALUES (?, ?, ?)
      ON CONFLICT(fid) DO UPDATE SET
        nickname = excluded.nickname,
        updated_at = CURRENT_TIMESTAMP
    `).run(fid, nickname, active);
  },

  findByFid: (fid: string): User | undefined => {
    return stmt(`SELECT ${COLUMNS} FROM users WHERE fid = ?`).get(fid) as User | undefined;
  },

  findActive: (): User[] => {
    return stmt(`SELECT ${COLUMNS} FROM users WHERE active = 1 ORDER BY created_at DESC`).all() as User[];
  },

  counts: (): { total: number; active: number } => {
    return stmt('SELECT COUNT(*) AS total, COALESCE(SUM(active = 1), 0) AS active FROM users').get() as { total: number; active: number };
  },

  /**
   * One page of the users matching the filters (newest first unless sorted), and the total match count
   */
  list: (filters: UserFilters, opts: { sort?: UserSortKey; desc?: boolean; limit: number; offset: number }): { users: User[]; total: number } => {
    const where = whereClause(filters);
    const order = opts.sort
      ? `(${SORT_EXPRESSIONS[opts.sort]} IS NULL), ${SORT_EXPRESSIONS[opts.sort]} ${opts.desc ? 'DESC' : 'ASC'}, created_at DESC`
      : 'created_at DESC';
    const rows = db.prepare(`SELECT ${COLUMNS} FROM users ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...where.params, opts.limit, opts.offset) as User[];
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users ${where.sql}`).get(...where.params) as { total: number };
    return { users: rows, total };
  },

  /**
   * FIDs of every user matching the filters (newest first)
   */
  findFids: (filters: UserFilters): string[] => {
    const where = whereClause(filters);
    return (db.prepare(`SELECT fid FROM users ${where.sql} ORDER BY created_at DESC`).all(...where.params) as { fid: string }[])
      .map(r => r.fid);
  },

  // Deactivating also takes the user out of the priority queue and drops their queued redemptions
  updateActive: (fid: string, active: number) => {
    return db.transaction(() => {
      const result = stmt('UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?').run(active, fid);
      if (active === 0) {
        stmt('DELETE FROM priority_users WHERE fid = ?').run(fid);
        stmt('DELETE FROM redemption_queue WHERE fid = ?').run(fid);
      }
      return result;
    })();
  },

  updateNickname: (fid: string, nickname: string) => {
    return stmt('UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?').run(nickname, fid);
  },

  // Save a kingdom the API could not check (inactive players): unverified, so registering again verifies it
  setUnverifiedKingdom: (fid: string, kingdom: string) => {
    return stmt(`
      UPDATE users
      SET kingdom = ?, kingdom_verified_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE fid = ?
    `).run(kingdom, fid);
  },

  // Save a kingdom that the API just accepted for this fid
  setVerifiedKingdom: (fid: string, kingdom: string) => {
    return stmt(`
      UPDATE users
      SET kingdom = ?, kingdom_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE fid = ?
    `).run(kingdom, fid);
  },

  updateAvatar: (fid: string, avatarUrl: string | null) => {
    return stmt('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?').run(avatarUrl, fid);
  }
};
