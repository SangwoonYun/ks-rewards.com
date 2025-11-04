import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

// Type definitions for database models
export interface User {
  fid: string;
  nickname: string | null;
  kingdom: string | null;
  avatar_url: string | null;
  active: number;
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
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

// Create data directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'ks-rewards.db');
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
    const stmt = db.prepare('SELECT * FROM users WHERE fid = ?');
    return stmt.get(fid) as User | undefined;
  },

  findAll: (): User[] => {
    const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all() as User[];
  },

  findActive: (): User[] => {
    const stmt = db.prepare('SELECT * FROM users WHERE active = 1 ORDER BY created_at DESC');
    return stmt.all() as User[];
  },

  updateActive: (fid: string, active: number) => {
    const stmt = db.prepare('UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return stmt.run(active, fid);
  },

  updateNickname: (fid: string, nickname: string) => {
    const stmt = db.prepare('UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return stmt.run(nickname, fid);
  },

  updateKingdom: (fid: string, kingdom: string) => {
    const stmt = db.prepare('UPDATE users SET kingdom = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return stmt.run(kingdom, fid);
  },

  updateAvatar: (fid: string, avatar_url: string) => {
    const stmt = db.prepare('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE fid = ?');
    return stmt.run(avatar_url, fid);
  }
};

export const giftCodes = {
  findAll: (limit?: number): GiftCode[] => {
    const sql = `
      SELECT * FROM gift_codes 
      ORDER BY date_discovered DESC
      ${limit ? ' LIMIT ?' : ''}
    `;
    const stmt = db.prepare(sql);
    return limit ? stmt.all(limit) as GiftCode[] : stmt.all() as GiftCode[];
  },

  findByCode: (code: string): GiftCode | undefined => {
    const stmt = db.prepare('SELECT * FROM gift_codes WHERE code = ?');
    return stmt.get(code) as GiftCode | undefined;
  },

  findByStatus: (status: string): GiftCode[] => {
    const stmt = db.prepare('SELECT * FROM gift_codes WHERE validation_status = ? ORDER BY date_discovered DESC');
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
    return stmt.run(code, status, source, date || new Date().toISOString());
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
      SELECT * FROM gift_codes 
      WHERE validation_status = 'validated'
      ORDER BY date_discovered DESC
    `);
    return stmt.all() as GiftCode[];
  }
};

export const redemptions = {
  findAll: (): Redemption[] => {
    const stmt = db.prepare('SELECT * FROM redemptions ORDER BY redeemed_at DESC');
    return stmt.all() as Redemption[];
  },

  findByCode: (code: string): Redemption[] => {
    const stmt = db.prepare('SELECT * FROM redemptions WHERE code = ? ORDER BY redeemed_at DESC');
    return stmt.all(code) as Redemption[];
  },

  findByFid: (fid: string): Redemption[] => {
    const stmt = db.prepare('SELECT * FROM redemptions WHERE fid = ? ORDER BY redeemed_at DESC');
    return stmt.all(fid) as Redemption[];
  },

  findRecent: (limit: number = 50): Redemption[] => {
    const stmt = db.prepare(`
      SELECT r.*, u.nickname, u.kingdom, u.avatar_url 
      FROM redemptions r 
      LEFT JOIN users u ON r.fid = u.fid 
      WHERE r.status = 'SUCCESS'
      ORDER BY r.redeemed_at DESC 
      LIMIT ?
    `);
    return stmt.all(limit) as Redemption[];
  },

  findByFidAndCode: (fid: string, code: string): Redemption | undefined => {
    const stmt = db.prepare('SELECT * FROM redemptions WHERE fid = ? AND code = ? ORDER BY redeemed_at DESC LIMIT 1');
    return stmt.get(fid, code) as Redemption | undefined;
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
        priority = excluded.priority,
        status = CASE 
          WHEN redemption_queue.status = 'processing' THEN redemption_queue.status
          ELSE 'pending'
        END
    `);
    return stmt.run(fid, code, priority);
  },

  // Bulk queue: add all combinations of active users and validated codes that haven't been redeemed yet
  // Uses INSERT OR IGNORE with a SELECT to add rows in a single statement for performance.
  bulkQueueValidatedForUsers: (priority: number = 0) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO redemption_queue (fid, code, priority)
      SELECT u.fid, g.code, ?
      FROM users u
      CROSS JOIN gift_codes g
      LEFT JOIN redemptions r ON r.fid = u.fid AND r.code = g.code
      WHERE u.active = 1
        AND g.validation_status = 'validated'
        AND r.id IS NULL
    `);
    return stmt.run(priority);
  },

  getPending: (limit: number): QueueItem[] => {
    const stmt = db.prepare(`
      SELECT * FROM redemption_queue 
      WHERE status = 'pending' 
      ORDER BY priority DESC, created_at ASC 
      LIMIT ?
    `);
    return stmt.all(limit) as QueueItem[];
  },

  updateStatus: (id: number, status: string, errorMessage?: string) => {
    const stmt = db.prepare(`
      UPDATE redemption_queue 
      SET status = ?, error_message = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(status, errorMessage || null, id);
  },


  delete: (id: number) => {
    const stmt = db.prepare('DELETE FROM redemption_queue WHERE id = ?');
    return stmt.run(id);
  }
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
