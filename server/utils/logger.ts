/**
 * Simple logging utility for server-side operations
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
} as const;

const currentLevel = LOG_LEVELS.INFO;

function formatTimestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  error: (...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error(`[${formatTimestamp()}] ERROR:`, ...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn(`[${formatTimestamp()}] WARN:`, ...args);
    }
  },
  
  info: (...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.info(`[${formatTimestamp()}] INFO:`, ...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.debug(`[${formatTimestamp()}] DEBUG:`, ...args);
    }
  }
};

