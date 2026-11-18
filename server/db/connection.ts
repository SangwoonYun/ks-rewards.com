import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';

const dbPath = config.db.path;
// The directory of the configured path (not a fixed ./data), so a custom NUXT_DB_PATH works too
if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
}

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 10000');
db.pragma('temp_store = MEMORY');
db.pragma('foreign_keys = ON');

// JavaScript lowercasing (SQLite's LOWER only handles ASCII), for case-insensitive search on nicknames
db.function('js_lower', { deterministic: true }, (value: unknown) =>
  typeof value === 'string' ? value.toLowerCase() : value
);
