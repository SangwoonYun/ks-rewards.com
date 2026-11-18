import { db } from './connection';
import { logger } from '../utils/logger';

type Migration = () => void;

function columns(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name);
}

/**
 * Schema versions (PRAGMA user_version). Version 1 is the schema built by the old unversioned
 * startup code; it stays idempotent so databases created before versioning (user_version 0) can run it.
 */
const MIGRATIONS: Migration[] = [
  // 1: baseline
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        fid TEXT PRIMARY KEY,
        nickname TEXT,
        kingdom TEXT,
        avatar_url TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gift_codes (
        code TEXT PRIMARY KEY,
        validation_status TEXT DEFAULT 'pending',
        source TEXT DEFAULT 'api',
        date_discovered DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS redemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fid TEXT NOT NULL,
        code TEXT NOT NULL,
        status TEXT NOT NULL,
        redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fid) REFERENCES users(fid),
        FOREIGN KEY (code) REFERENCES gift_codes(code)
      );
    `);

    // Legacy: drop redemptions.error_message (SQLite can't DROP COLUMN on old versions, so recreate the table)
    if (columns('redemptions').includes('error_message')) {
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
    }

    const userColumns = columns('users');
    if (!userColumns.includes('kingdom')) db.exec('ALTER TABLE users ADD COLUMN kingdom TEXT');
    if (!userColumns.includes('avatar_url')) db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    if (!userColumns.includes('kingdom_verified_at')) db.exec('ALTER TABLE users ADD COLUMN kingdom_verified_at DATETIME');

    // Normalize redemption statuses to underscores (e.g. 'SAME TYPE EXCHANGE' -> 'SAME_TYPE_EXCHANGE')
    db.exec("UPDATE redemptions SET status = REPLACE(status, ' ', '_') WHERE status LIKE '% %'");
    // ISO gift code dates ('...T...Z') to SQLite format; reads append 'Z'
    db.exec("UPDATE gift_codes SET date_discovered = strftime('%Y-%m-%d %H:%M:%S', date_discovered) WHERE date_discovered LIKE '%T%'");

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
      );

      CREATE TABLE IF NOT EXISTS priority_users (
        fid TEXT PRIMARY KEY,
        priority INTEGER DEFAULT 10,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fid) REFERENCES users(fid)
      );

      CREATE INDEX IF NOT EXISTS idx_redemptions_fid ON redemptions(fid);
      CREATE INDEX IF NOT EXISTS idx_redemptions_code ON redemptions(code);
      CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status);
      CREATE INDEX IF NOT EXISTS idx_queue_status ON redemption_queue(status);
      CREATE INDEX IF NOT EXISTS idx_queue_priority ON redemption_queue(priority DESC);
    `);
  },

  // 2: indexes for the per-(fid, code) lookups (latest redemption, failures, bulk queueing) and for
  //    taking the next pending queue item; the single-column indexes they cover are dropped
  () => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_redemptions_fid_code ON redemptions(fid, code, id);
      CREATE INDEX IF NOT EXISTS idx_queue_pending ON redemption_queue(status, priority DESC, created_at);
      DROP INDEX IF EXISTS idx_redemptions_fid;
      DROP INDEX IF EXISTS idx_queue_status;
    `);
  },
];

export function runMigrations() {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current >= MIGRATIONS.length) {
    logger.info(`Database schema is up to date (version ${current})`);
  } else {
    for (let version = current + 1; version <= MIGRATIONS.length; version++) {
      logger.info(`Migrating database schema to version ${version}...`);
      db.transaction(() => {
        MIGRATIONS[version - 1]!();
        db.pragma(`user_version = ${version}`);
      })();
    }
    logger.info(`✅ Database schema migrated to version ${MIGRATIONS.length}`);
  }

  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    logger.warn(`⚠️  ${violations.length} existing row(s) violate foreign keys (new writes are checked from now on)`);
  }
}
