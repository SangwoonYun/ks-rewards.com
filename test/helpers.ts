import { db, runMigrations } from '../server/db';

let migrated = false;

/**
 * Empty, migrated in-memory database (one per test file)
 */
export function resetDb() {
  if (!migrated) {
    runMigrations();
    migrated = true;
  }
  db.exec(`
    DELETE FROM redemption_queue;
    DELETE FROM redemptions;
    DELETE FROM priority_users;
    DELETE FROM gift_codes;
    DELETE FROM users;
  `);
}

export function addUser(fid: string, kingdom: string | null = '100', opts: { active?: number; createdAt?: string; nickname?: string } = {}) {
  db.prepare('INSERT INTO users (fid, nickname, kingdom, active, created_at) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))')
    .run(fid, opts.nickname ?? null, kingdom, opts.active ?? 1, opts.createdAt ?? null);
}

export function addCode(code: string, status = 'validated') {
  db.prepare('INSERT INTO gift_codes (code, validation_status) VALUES (?, ?)').run(code, status);
}

export function queueRows() {
  return db.prepare('SELECT fid, code, status, attempts, priority FROM redemption_queue ORDER BY id').all() as
    { fid: string; code: string; status: string; attempts: number; priority: number }[];
}
