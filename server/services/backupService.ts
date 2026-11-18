import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { logger } from '../utils/logger';

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const LATEST_NAME = 'ks-rewards_latest.db';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Back up the database with SQLite's online backup API (a consistent snapshot, WAL included),
 * refresh ks-rewards_latest.db and delete backups older than 30 days
 */
export async function createBackup(): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFileName = `ks-rewards_${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupFileName);

  await db.backup(backupPath);
  fs.copyFileSync(backupPath, path.join(BACKUP_DIR, LATEST_NAME));

  const sizeMB = (fs.statSync(backupPath).size / (1024 * 1024)).toFixed(2);
  logger.info(`✅ Backup created: ${backupFileName} (${sizeMB} MB)`);

  cleanOldBackups();
  return backupPath;
}

function cleanOldBackups() {
  const now = Date.now();
  let kept = 0;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (file === LATEST_NAME || !file.startsWith('ks-rewards_') || !file.endsWith('.db')) continue;

    const filePath = path.join(BACKUP_DIR, file);
    if (now - fs.statSync(filePath).mtimeMs > RETENTION_MS) {
      fs.unlinkSync(filePath);
      logger.info(`Deleted old backup: ${file}`);
    } else {
      kept++;
    }
  }
  logger.info(`Total backups retained: ${kept}`);
}
