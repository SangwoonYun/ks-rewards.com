import type { Statement } from 'better-sqlite3';
import { db } from './connection';

const cache = new Map<string, Statement>();

/**
 * Prepared statement for this SQL, prepared once and reused
 */
export function stmt(sql: string): Statement {
  let prepared = cache.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    cache.set(sql, prepared);
  }
  return prepared;
}

/**
 * A DATETIME column (SQLite UTC 'YYYY-MM-DD HH:MM:SS') read as ISO-like UTC: appends 'Z'
 */
export function utc(column: string, alias = column.split('.').pop()!): string {
  return `(${column} || 'Z') AS ${alias}`;
}

/**
 * SQL list literal of constant strings (only for constants from the code, never user input)
 */
export function sqlList(values: readonly string[]): string {
  return values.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
}

/**
 * Current time in SQLite's CURRENT_TIMESTAMP format (UTC, second precision)
 */
export function sqliteNow(date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}
