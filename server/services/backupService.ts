import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

function getDbPath() {
  return config.db.path;
}

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Create a backup of the database
 * This properly handles WAL mode by using SQLite's backup API
 */
export async function createBackup(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFileName = `ks-rewards_${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupFileName);
  const latestPath = path.join(BACKUP_DIR, 'ks-rewards_latest.db');

  try {
    logger.info(`Creating database backup: ${backupFileName}`);

    // Open source database in readonly mode
    const sourceDb = new Database(getDbPath(), { readonly: true });

    try {
      // Create backup using SQLite's backup API
      // This properly handles WAL mode and creates a consistent snapshot
      await sourceDb.backup(backupPath);

      logger.info('✅ Backup finished');
    } finally {
      sourceDb.close();
    }

    // Copy to latest backup
    fs.copyFileSync(backupPath, latestPath);

    // Get backup size
    const stats = fs.statSync(backupPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    logger.info(`✅ Backup created successfully: ${backupFileName} (${sizeMB} MB)`);

    // Clean up old backups (keep last 30 days)
    cleanOldBackups();

    return backupPath;
  } catch (error: any) {
    logger.error('Failed to create backup:', error);
    throw error;
  }
}

/**
 * Clean up old backups, keeping only the last 30 days
 */
function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      // Skip the latest backup symlink/copy
      if (file === 'ks-rewards_latest.db') {
        continue;
      }

      // Only process backup files
      if (file.startsWith('ks-rewards_') && file.endsWith('.db')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > thirtyDaysMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.info(`Deleted old backup: ${file}`);
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old backup(s)`);
    }

    // Count remaining backups
    const remainingBackups = files.filter(
      f => f.startsWith('ks-rewards_') && f.endsWith('.db') && f !== 'ks-rewards_latest.db'
    ).length;
    logger.info(`Total backups retained: ${remainingBackups}`);
  } catch (error: any) {
    logger.error('Error cleaning up old backups:', error);
  }
}

/**
 * Get list of available backups
 */
export function listBackups(): Array<{ filename: string; size: number; date: Date }> {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backups = files
      .filter(f => f.startsWith('ks-rewards_') && f.endsWith('.db') && f !== 'ks-rewards_latest.db')
      .map(filename => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          date: stats.mtime
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return backups;
  } catch (error: any) {
    logger.error('Error listing backups:', error);
    return [];
  }
}

/**
 * Get path to the latest backup
 */
export function getLatestBackupPath(): string | null {
  const latestPath = path.join(BACKUP_DIR, 'ks-rewards_latest.db');
  if (fs.existsSync(latestPath)) {
    return latestPath;
  }
  return null;
}

/**
 * Restore database from a backup
 */
export async function restoreFromBackup(backupFileName: string): Promise<void> {
  const backupPath = path.join(BACKUP_DIR, backupFileName);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupFileName}`);
  }

  try {
    logger.warn(`⚠️  Restoring database from backup: ${backupFileName}`);

    // Create a backup of the current database before restoring
    const currentBackupName = `ks-rewards_pre-restore_${Date.now()}.db`;
    const currentBackupPath = path.join(BACKUP_DIR, currentBackupName);
    fs.copyFileSync(getDbPath(), currentBackupPath);
    logger.info(`Current database backed up to: ${currentBackupName}`);

    // Close any existing connections (this should be done before calling restore)
    // The application may need to be restarted after restore

    // Copy backup to main database location
    fs.copyFileSync(backupPath, getDbPath());

    logger.info(`✅ Database restored from: ${backupFileName}`);
    logger.warn('⚠️  Application should be restarted for changes to take effect');
  } catch (error: any) {
    logger.error('Failed to restore backup:', error);
    throw error;
  }
}

