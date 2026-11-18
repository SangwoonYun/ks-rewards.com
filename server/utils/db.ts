import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { config } from './config';

// Type definitions for database models
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

export interface GiftCode {
  code: string;
  validation_status: string;
  source: string;
  date_discovered: string;
}

export interface Redemption {
  id: number;
  fid: string;
  code: string;
  status: string;
  redeemed_at: string;
  nickname?: string | null;
  kingdom?: string | null;
  avatar_url?: string | null;
}

export interface RedemptionFailureRow {
  fid: string;
  nickname: string | null;
  kingdom: string | null;
  avatar_url: string | null;
  code: string;
  status: string;
  redeemed_at: string;
}

export interface QueueItem {
  id: number;
  fid: string;
  code: string;
  priority: number;
  status: string;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  nickname?: string | null;
  kingdom?: string | null;
  avatar_url?: string | null;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export interface PriorityUser {
  fid: string;
  priority: number;
  added_at: string;
  nickname?: string | null;
  kingdom?: string | null;
  avatar_url?: string | null;
  active?: number;
}

// Create data directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = config.db.path;
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 10000');
db.pragma('temp_store = MEMORY');

// Database helper functions
export const users = {
  create: (fid: string, nickname: string | null = null, active: number = 1) => {
    const stmt = db.prepare(`
      INSERT INTO users (fid, nickname, active) 
      VALUES (?, ?, ?)
      ON CONFLICT(fid) DO UPDATE SET 
        nickname = excluded.nickname,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(fid, nickname, active);
  },

  findByFid: (fid: string): User | undefined => {
    const stmt = db.prepare("SELECT *, (created_at || 'Z') AS created_at, (updated_at || 'Z') AS updated_at FROM users WHERE fid = ?");
    return stmt.get(fid) as User | undefined;
  },

  findAll: (): User[] => {
    const stmt = db.prepare("SELECT *, (created_at || 'Z') AS created_at, (updated_at || 'Z') AS updated_at FROM users ORDER BY created_at DESC");
    return stmt.all() as User[];
  },

  findActive: (): User[] => {
    const stmt = db.prepare("SELECT *, (created_at || 'Z') AS created_at, (updated_at || 'Z') AS updated_at FROM users WHERE active = 1 ORDER BY created_at DESC");
    return stmt.all() as User[];
  },

  // Deactivating also takes the user out of the priority queue and drops their queued redemptions
  updateActive: (fid: string, active: number) => {
    const stmt = db.prepare('UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return db.transaction(() => {
      const result = stmt.run(active, fid);
      if (active === 0) {
        priorityUsers.remove(fid);
        queue.deleteByFid(fid);
      }
      return result;
    })();
  },

  updateNickname: (fid: string, nickname: string) => {
    const stmt = db.prepare('UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return stmt.run(nickname, fid);
  },

  updateKingdom: (fid: string, kingdom: string) => {
    const stmt = db.prepare('UPDATE users SET kingdom = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return stmt.run(kingdom, fid);
  },

  // Save a kingdom that the API just accepted for this fid
  setVerifiedKingdom: (fid: string, kingdom: string) => {
    const stmt = db.prepare(`
      UPDATE users
      SET kingdom = ?, kingdom_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE fid = ?
    `);
    return stmt.run(kingdom, fid);
  },

  updateAvatar: (fid: string, avatar_url: string | null) => {
    const stmt = db.prepare('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return stmt.run(avatar_url, fid);
  }
};

export const giftCodes = {
  findAll: (limit?: number): GiftCode[] => {
    const sql = `
      SELECT *, (date_discovered || 'Z') AS date_discovered FROM gift_codes
      ORDER BY date_discovered DESC
      ${limit ? ' LIMIT ?' : ''}
    `;
    const stmt = db.prepare(sql);
    return limit ? stmt.all(limit) as GiftCode[] : stmt.all() as GiftCode[];
  },

  findByCode: (code: string): GiftCode | undefined => {
    const stmt = db.prepare("SELECT *, (date_discovered || 'Z') AS date_discovered FROM gift_codes WHERE code = ?");
    return stmt.get(code) as GiftCode | undefined;
  },

  findByStatus: (status: string): GiftCode[] => {
    const stmt = db.prepare("SELECT *, (date_discovered || 'Z') AS date_discovered FROM gift_codes WHERE validation_status = ? ORDER BY date_discovered DESC");
    return stmt.all(status) as GiftCode[];
  },

  stats: () => {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN validation_status = 'validated' THEN 1 ELSE 0 END) as validated,
        SUM(CASE WHEN validation_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN validation_status = 'invalid' THEN 1 ELSE 0 END) as invalid,
        SUM(CASE WHEN validation_status = 'expired' THEN 1 ELSE 0 END) as expired
      FROM gift_codes
    `);
    return stmt.get() as { total: number; validated: number; pending: number; invalid: number; expired: number; };
  },

  updateStatus: (code: string, status: string) => {
    const stmt = db.prepare('UPDATE gift_codes SET validation_status = ? WHERE code = ?');
    return stmt.run(status, code);
  },

  insertOrIgnore: (code: string, status: string = 'pending', source: string = 'api', date?: string) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO gift_codes (code, validation_status, source, date_discovered)
      VALUES (?, ?, ?, ?)
    `);
    // Store in SQLite's UTC format ('YYYY-MM-DD HH:MM:SS') like CURRENT_TIMESTAMP; reads append 'Z'
    const discovered = new Date(date || Date.now()).toISOString().replace('T', ' ').slice(0, 19);
    return stmt.run(code, status, source, discovered);
  },

  delete: (code: string) => {
    const stmt = db.prepare('DELETE FROM gift_codes WHERE code = ?');
    return stmt.run(code);
  },

  updateValidation: (code: string, status: string) => {
    return giftCodes.updateStatus(code, status);
  },

  markInvalid: (code: string) => {
    return giftCodes.updateStatus(code, 'invalid');
  },

  findValid: (): GiftCode[] => {
    const stmt = db.prepare(`
      SELECT *, (date_discovered || 'Z') AS date_discovered FROM gift_codes
      WHERE validation_status = 'validated'
      ORDER BY date_discovered DESC
    `);
    return stmt.all() as GiftCode[];
  }
};

export const redemptions = {
  findAll: (): Redemption[] => {
    const stmt = db.prepare("SELECT *, (redeemed_at || 'Z') AS redeemed_at FROM redemptions ORDER BY redeemed_at DESC");
    return stmt.all() as Redemption[];
  },

  findByCode: (code: string): Redemption[] => {
    const stmt = db.prepare("SELECT *, (redeemed_at || 'Z') AS redeemed_at FROM redemptions WHERE code = ? ORDER BY redeemed_at DESC");
    return stmt.all(code) as Redemption[];
  },

  findByFid: (fid: string): Redemption[] => {
    const stmt = db.prepare("SELECT *, (redeemed_at || 'Z') AS redeemed_at FROM redemptions WHERE fid = ? ORDER BY redeemed_at DESC");
    return stmt.all(fid) as Redemption[];
  },

  findRecent: (limit: number = 50): Redemption[] => {
    const stmt = db.prepare(`
      SELECT r.*, (r.redeemed_at || 'Z') AS redeemed_at, u.nickname, u.kingdom, u.avatar_url
      FROM redemptions r
      LEFT JOIN users u ON r.fid = u.fid
      WHERE r.status = 'SUCCESS'
      ORDER BY r.redeemed_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Redemption[];
  },

  findByFidAndCode: (fid: string, code: string): Redemption | undefined => {
    const stmt = db.prepare("SELECT *, (redeemed_at || 'Z') AS redeemed_at FROM redemptions WHERE fid = ? AND code = ? ORDER BY redeemed_at DESC LIMIT 1");
    return stmt.get(fid, code) as Redemption | undefined;
  },

  // Final failures of active users: (fid, code) pairs whose latest attempt has a status outside
  // settledStatuses (success, dead code, player not eligible) and that are no longer queued, i.e. retries
  // are used up. Failures from before the kingdom was last verified are ignored: verifying a kingdom
  // queues every unredeemed code again, so those failures are already being retried or superseded.
  // Only codes that are still valid count: a failure on a code that expired since can never be retried
  // (a retry only queues valid codes), so it would keep the user listed forever.
  findFinalFailures: (settledStatuses: string[]): RedemptionFailureRow[] => {
    const placeholders = settledStatuses.map(() => '?').join(', ');
    const stmt = db.prepare(`
      WITH latest AS (
        SELECT r.fid, r.code, r.status, r.redeemed_at
        FROM redemptions r
        WHERE r.id = (
          SELECT MAX(r2.id) FROM redemptions r2
          WHERE r2.fid = r.fid AND r2.code = r.code
        )
      )
      SELECT u.fid, u.nickname, u.kingdom, u.avatar_url, l.code, l.status, (l.redeemed_at || 'Z') AS redeemed_at
      FROM latest l
      JOIN users u ON u.fid = l.fid
      JOIN gift_codes g ON g.code = l.code AND g.validation_status = 'validated'
      WHERE l.status NOT IN (${placeholders})
        AND u.active = 1
        AND (u.kingdom_verified_at IS NULL OR l.redeemed_at > u.kingdom_verified_at)
        AND NOT EXISTS (
          SELECT 1 FROM redemption_queue q
          WHERE q.fid = l.fid AND q.code = l.code AND q.status IN ('pending', 'processing')
        )
      ORDER BY l.redeemed_at DESC
    `);
    return stmt.all(...settledStatuses) as RedemptionFailureRow[];
  },

  create: (fid: string, code: string, status: string) => {
    const stmt = db.prepare(`
      INSERT INTO redemptions (fid, code, status)
      VALUES (?, ?, ?)
    `);
    return stmt.run(fid, code, status);
  }
};

export const queue = {
  add: (fid: string, code: string, priority: number = 0) => {
    const stmt = db.prepare(`
      INSERT INTO redemption_queue (fid, code, priority, status, attempts)
      VALUES (?, ?, ?, 'pending', 0)
      ON CONFLICT(fid, code) DO UPDATE SET
        priority = MAX(redemption_queue.priority, excluded.priority),
        status = CASE
          WHEN redemption_queue.status = 'processing' THEN redemption_queue.status
          ELSE 'pending'
        END,
        -- A failed item re-entering the queue gets a fresh retry budget;
        -- an item still pending/processing keeps counting
        attempts = CASE WHEN redemption_queue.status = 'failed' THEN 0 ELSE redemption_queue.attempts END,
        error_message = CASE WHEN redemption_queue.status = 'failed' THEN NULL ELSE redemption_queue.error_message END
    `);
    return stmt.run(fid, code, priority);
  },

  // Bulk queue: add all combinations of active users and validated codes
  // Excludes users who already succeeded or permanently failed for a given code
  // Respects priority_users table: priority users get their configured priority
  bulkQueueValidatedForUsers: (priority: number = 0) => {
    const stmt = db.prepare(`
      INSERT INTO redemption_queue (fid, code, priority, status, attempts)
      SELECT u.fid, g.code, COALESCE(pu.priority, ?), 'pending', 0
      FROM users u
      CROSS JOIN gift_codes g
      LEFT JOIN priority_users pu ON u.fid = pu.fid
      WHERE u.active = 1
        AND g.validation_status = 'validated'
        AND NOT EXISTS (
          SELECT 1 FROM redemptions r
          WHERE r.fid = u.fid AND r.code = g.code
            AND r.status IN (
              'SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE',
              'STOVE_LV_ERROR', 'RECHARGE_MONEY_ERROR', 'RECHARGE_MONEY_VIP_ERROR'
            )
        )
        -- Latest result is USER_INFO_ERROR and the kingdom was not verified since: the user is in the
        -- redemption failures list as a wrong kingdom (or still being retried). Fixing the kingdom redeems these right away.
        AND NOT EXISTS (
          SELECT 1 FROM redemptions r
          WHERE r.fid = u.fid AND r.code = g.code
            AND r.status = 'USER_INFO_ERROR'
            AND r.id = (SELECT MAX(r2.id) FROM redemptions r2 WHERE r2.fid = r.fid AND r2.code = r.code)
            AND (u.kingdom_verified_at IS NULL OR r.redeemed_at > u.kingdom_verified_at)
        )
      ON CONFLICT(fid, code) DO UPDATE SET
        priority = MAX(redemption_queue.priority, excluded.priority),
        status = CASE
          WHEN redemption_queue.status IN ('failed', 'pending') THEN 'pending'
          ELSE redemption_queue.status
        END,
        -- A failed item re-entering the queue gets a fresh retry budget;
        -- an item still pending/processing keeps counting
        attempts = CASE WHEN redemption_queue.status = 'failed' THEN 0 ELSE redemption_queue.attempts END,
        error_message = CASE WHEN redemption_queue.status = 'failed' THEN NULL ELSE redemption_queue.error_message END
    `);
    return stmt.run(priority);
  },

  getPending: (limit: number): QueueItem[] => {
    const stmt = db.prepare(`
      SELECT *, (created_at || 'Z') AS created_at, (updated_at || 'Z') AS updated_at
      FROM redemption_queue
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);
    return stmt.all(limit) as QueueItem[];
  },

  getPendingByFid: (fid: string, limit: number): QueueItem[] => {
    const stmt = db.prepare(`
      SELECT *, (created_at || 'Z') AS created_at, (updated_at || 'Z') AS updated_at
      FROM redemption_queue
      WHERE status = 'pending' AND fid = ?
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);
    return stmt.all(fid, limit) as QueueItem[];
  },

  updateStatus: (id: number, status: string, errorMessage?: string) => {
    const stmt = db.prepare(`
      UPDATE redemption_queue 
      SET status = ?, error_message = ?,
        attempts = attempts + (CASE WHEN ? = 'processing' THEN 1 ELSE 0 END),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    // Only count an attempt when it starts (-> 'processing'), not again when its outcome is recorded
    return stmt.run(status, errorMessage || null, status, id);
  },

  delete: (id: number) => {
    const stmt = db.prepare('DELETE FROM redemption_queue WHERE id = ?');
    return stmt.run(id);
  },

  // Remove all queued entries for a specific gift code (used when a code is marked invalid)
  deleteByCode: (code: string) => {
    const stmt = db.prepare('DELETE FROM redemption_queue WHERE code = ?');
    return stmt.run(code);
  },

  // Remove all queued entries for a user (used when the user is deactivated)
  deleteByFid: (fid: string) => {
    const stmt = db.prepare('DELETE FROM redemption_queue WHERE fid = ?');
    return stmt.run(fid);
  },

  getAll: (limit: number = 200): QueueItem[] => {
    const stmt = db.prepare(`
      SELECT rq.*, (rq.created_at || 'Z') AS created_at, (rq.updated_at || 'Z') AS updated_at,
             u.nickname, u.kingdom, u.avatar_url
      FROM redemption_queue rq
      LEFT JOIN users u ON rq.fid = u.fid
      ORDER BY rq.updated_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as QueueItem[];
  },

  // Items left 'processing' by a restart are never picked up again; put them back (their attempt was already counted)
  resetStuckProcessing: () => {
    const stmt = db.prepare(`
      UPDATE redemption_queue
      SET status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processing'
    `);
    return stmt.run().changes;
  },

  countPending: (): number => {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM redemption_queue WHERE status = 'pending'`);
    const result = stmt.get() as { count: number };
    return result.count;
  },

  resetToPending: (id: number) => {
    const stmt = db.prepare(`
      UPDATE redemption_queue
      SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('failed', 'processing')
    `);
    return stmt.run(id);
  },

  getPriorityItems: (limit: number = 200): QueueItem[] => {
    const stmt = db.prepare(`
      SELECT rq.*, (rq.created_at || 'Z') AS created_at, (rq.updated_at || 'Z') AS updated_at,
             u.nickname, u.avatar_url
      FROM redemption_queue rq
      LEFT JOIN users u ON rq.fid = u.fid
      WHERE rq.priority > 0
      ORDER BY rq.priority DESC, rq.created_at ASC
      LIMIT ?
    `);
    return stmt.all(limit) as QueueItem[];
  },
};

export const priorityUsers = {
  add: (fid: string, priority: number = 10) => {
    const stmt = db.prepare(`
      INSERT INTO priority_users (fid, priority)
      VALUES (?, ?)
      ON CONFLICT(fid) DO UPDATE SET
        priority = excluded.priority,
        added_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(fid, priority);
  },

  remove: (fid: string) => {
    const stmt = db.prepare('DELETE FROM priority_users WHERE fid = ?');
    return stmt.run(fid);
  },

  findByFid: (fid: string): PriorityUser | undefined => {
    const stmt = db.prepare(`
      SELECT pu.*, (pu.added_at || 'Z') AS added_at, u.nickname, u.kingdom, u.avatar_url, u.active
      FROM priority_users pu
      LEFT JOIN users u ON pu.fid = u.fid
      WHERE pu.fid = ?
    `);
    return stmt.get(fid) as PriorityUser | undefined;
  },

  findAll: (): PriorityUser[] => {
    const stmt = db.prepare(`
      SELECT pu.*, (pu.added_at || 'Z') AS added_at, u.nickname, u.kingdom, u.avatar_url, u.active
      FROM priority_users pu
      LEFT JOIN users u ON pu.fid = u.fid
      ORDER BY pu.priority DESC, pu.added_at ASC
    `);
    return stmt.all() as PriorityUser[];
  },

  getAllFids: (): string[] => {
    const stmt = db.prepare('SELECT fid FROM priority_users');
    return (stmt.all() as { fid: string }[]).map(r => r.fid);
  },

  getPriorityForFid: (fid: string): number => {
    const stmt = db.prepare('SELECT priority FROM priority_users WHERE fid = ?');
    const row = stmt.get(fid) as { priority: number } | undefined;
    return row ? row.priority : 0;
  },
};

// Run migrations on startup
export function runMigrations() {
  logger.info('Running database migrations...');

  try {
    // Create users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        fid TEXT PRIMARY KEY,
        nickname TEXT,
        kingdom TEXT,
        avatar_url TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create gift_codes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS gift_codes (
        code TEXT PRIMARY KEY,
        validation_status TEXT DEFAULT 'pending',
        source TEXT DEFAULT 'api',
        date_discovered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create redemptions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS redemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fid TEXT NOT NULL,
        code TEXT NOT NULL,
        status TEXT NOT NULL,
        redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fid) REFERENCES users(fid),
        FOREIGN KEY (code) REFERENCES gift_codes(code)
      )
    `);

    // Migration: Remove error_message column from redemptions table if it exists
    // SQLite doesn't support DROP COLUMN, so we need to recreate the table
    const redemptionsColumns = db.prepare("PRAGMA table_info(redemptions)").all() as Array<{ name: string }>;
    const hasErrorMessage = redemptionsColumns.some(col => col.name === 'error_message');

    if (hasErrorMessage) {
      logger.info('Migrating redemptions table to remove error_message column...');
      db.exec(`
        CREATE TABLE redemptions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fid TEXT NOT NULL,
          code TEXT NOT NULL,
          status TEXT NOT NULL,
          redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (fid) REFERENCES users(fid),
          FOREIGN KEY (code) REFERENCES gift_codes(code)
        );
        
        INSERT INTO redemptions_new (id, fid, code, status, redeemed_at)
        SELECT id, fid, code, status, redeemed_at FROM redemptions;
        
        DROP TABLE redemptions;
        
        ALTER TABLE redemptions_new RENAME TO redemptions;
      `);
      logger.info('✅ Redemptions table migration complete');
    }

    // Migration: Add kingdom column to users table if it doesn't exist
    const usersColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasKingdom = usersColumns.some(col => col.name === 'kingdom');

    if (!hasKingdom) {
      logger.info('Adding kingdom column to users table...');
      db.exec(`ALTER TABLE users ADD COLUMN kingdom TEXT`);
      logger.info('✅ Kingdom column added to users table');
    }

    // Migration: Add avatar_url column to users table if it doesn't exist
    const hasAvatarUrl = usersColumns.some(col => col.name === 'avatar_url');

    if (!hasAvatarUrl) {
      logger.info('Adding avatar_url column to users table...');
      db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
      logger.info('✅ Avatar URL column added to users table');
    }

    // Migration: Add kingdom_verified_at column to users table if it doesn't exist
    const hasKingdomVerifiedAt = usersColumns.some(col => col.name === 'kingdom_verified_at');

    if (!hasKingdomVerifiedAt) {
      logger.info('Adding kingdom_verified_at column to users table...');
      db.exec(`ALTER TABLE users ADD COLUMN kingdom_verified_at DATETIME`);
      logger.info('✅ kingdom_verified_at column added to users table');
    }

    // Migration: Normalize redemption statuses to underscores (e.g. 'SAME TYPE EXCHANGE' -> 'SAME_TYPE_EXCHANGE')
    const normalizedStatuses = db.prepare(
      "UPDATE redemptions SET status = REPLACE(status, ' ', '_') WHERE status LIKE '% %'"
    ).run();
    if (normalizedStatuses.changes > 0) {
      logger.info(`✅ Normalized ${normalizedStatuses.changes} redemption status(es)`);
    }

    // Migration: Convert ISO gift code dates ('...T...Z') to SQLite format; reads append 'Z',
    // which turned them into '...ZZ' (shown as "Invalid Date")
    const normalizedDates = db.prepare(
      "UPDATE gift_codes SET date_discovered = strftime('%Y-%m-%d %H:%M:%S', date_discovered) WHERE date_discovered LIKE '%T%'"
    ).run();
    if (normalizedDates.changes > 0) {
      logger.info(`✅ Normalized ${normalizedDates.changes} gift code date(s)`);
    }

    // Create redemption_queue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS redemption_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fid TEXT NOT NULL,
        code TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fid, code)
      )
    `);
    // Create settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create priority_users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS priority_users (
        fid TEXT PRIMARY KEY,
        priority INTEGER DEFAULT 10,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fid) REFERENCES users(fid)
      )
    `);

    // Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_redemptions_fid ON redemptions(fid)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_redemptions_code ON redemptions(code)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_queue_status ON redemption_queue(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_queue_priority ON redemption_queue(priority DESC)');

    logger.info('✅ Database migrations complete');
  } catch (error) {
    logger.error('Error running migrations:', error);
    throw error;
  }
}
