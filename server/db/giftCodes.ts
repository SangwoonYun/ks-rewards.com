import { db } from './connection';
import { stmt, utc, sqliteNow } from './sql';

export interface GiftCode {
  code: string;
  validation_status: string;
  source: string;
  date_discovered: string;
}

export interface GiftCodeStats {
  total: number;
  validated: number;
  pending: number;
  invalid: number;
  expired: number;
}

const COLUMNS = `code, validation_status, source, ${utc('date_discovered')}`;

// 'deleted' is a soft delete: the row stays so redemption history (foreign key) and the code's identity survive
// (sync can't re-add it), but it is hidden from listings and stats and its status is frozen
export const giftCodes = {
  findAll: (): GiftCode[] => {
    return stmt(`SELECT ${COLUMNS} FROM gift_codes WHERE validation_status != 'deleted' ORDER BY date_discovered DESC`).all() as GiftCode[];
  },

  findByCode: (code: string): GiftCode | undefined => {
    return stmt(`SELECT ${COLUMNS} FROM gift_codes WHERE code = ?`).get(code) as GiftCode | undefined;
  },

  findByStatus: (status: string): GiftCode[] => {
    return stmt(`SELECT ${COLUMNS} FROM gift_codes WHERE validation_status = ? ORDER BY date_discovered DESC`).all(status) as GiftCode[];
  },

  /**
   * Newest codes having one of the statuses (the public code list)
   */
  findByStatuses: (statuses: string[], limit: number): GiftCode[] => {
    const placeholders = statuses.map(() => '?').join(', ');
    return db.prepare(`
      SELECT ${COLUMNS} FROM gift_codes
      WHERE validation_status IN (${placeholders})
      ORDER BY date_discovered DESC
      LIMIT ?
    `).all(...statuses, limit) as GiftCode[];
  },

  /**
   * One page of the admin code list: one status, or every status but deleted with validated codes first;
   * search is a case-insensitive "contains"
   */
  list: (opts: { status?: string; search?: string; limit: number; offset: number }): { codes: GiftCode[]; total: number } => {
    const conditions = [opts.status ? 'validation_status = ?' : "validation_status != 'deleted'"];
    const params: unknown[] = opts.status ? [opts.status] : [];
    if (opts.search) {
      conditions.push('instr(LOWER(code), ?) > 0');
      params.push(opts.search.toLowerCase());
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const order = opts.status
      ? 'date_discovered DESC'
      : "(validation_status = 'validated') DESC, date_discovered DESC";

    const codes = db.prepare(`SELECT ${COLUMNS} FROM gift_codes ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, opts.limit, opts.offset) as GiftCode[];
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM gift_codes ${where}`).get(...params) as { total: number };
    return { codes, total };
  },

  stats: (): GiftCodeStats => {
    return stmt(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(validation_status = 'validated'), 0) AS validated,
        COALESCE(SUM(validation_status = 'pending'), 0) AS pending,
        COALESCE(SUM(validation_status = 'invalid'), 0) AS invalid,
        COALESCE(SUM(validation_status = 'expired'), 0) AS expired
      FROM gift_codes
      WHERE validation_status != 'deleted'
    `).get() as GiftCodeStats;
  },

  updateStatus: (code: string, status: string) => {
    // A redemption finishing after the delete must not bring the code back
    return stmt("UPDATE gift_codes SET validation_status = ? WHERE code = ? AND validation_status != 'deleted'").run(status, code);
  },

  insertOrIgnore: (code: string, status: string = 'pending', source: string = 'api', date?: string) => {
    // Stored in SQLite's UTC format like CURRENT_TIMESTAMP; reads append 'Z'
    return stmt(`
      INSERT OR IGNORE INTO gift_codes (code, validation_status, source, date_discovered)
      VALUES (?, ?, ?, ?)
    `).run(code, status, source, sqliteNow(new Date(date || Date.now())));
  },

  markDeleted: (code: string) => {
    return db.transaction(() => {
      stmt('DELETE FROM redemption_queue WHERE code = ?').run(code);
      return stmt("UPDATE gift_codes SET validation_status = 'deleted' WHERE code = ?").run(code);
    })();
  },

  restoreDeleted: (code: string) => {
    return stmt("UPDATE gift_codes SET validation_status = 'pending' WHERE code = ? AND validation_status = 'deleted'").run(code);
  }
};
