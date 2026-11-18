import { describe, it, expect } from 'vitest';
import { db, runMigrations } from '../server/db';

describe('migrations', () => {
  it('reaches the latest version, and running again changes nothing', () => {
    runMigrations();
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);
    runMigrations();
    expect(db.pragma('user_version', { simple: true })).toBe(version);
    const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map(i => i.name);
    expect(indexes).toContain('idx_redemptions_fid_code');
    expect(indexes).toContain('idx_queue_pending');
  });

  it('enforces foreign keys', () => {
    expect(() => db.prepare("INSERT INTO redemptions (fid, code, status) VALUES ('nobody', 'NOCODE', 'SUCCESS')").run()).toThrow();
  });
});
