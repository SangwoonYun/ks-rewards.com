import { logger } from '../utils/logger';

const running = new Set<string>();

/**
 * Run fn unless a job with the same name is still running (then skip it and return null).
 * Keeps interval-driven jobs from overlapping when one run takes longer than the interval.
 */
export async function runExclusive<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  if (running.has(name)) {
    logger.info(`⏭️  ${name} is still running, skipped`);
    return null;
  }
  running.add(name);
  try {
    return await fn();
  } finally {
    running.delete(name);
  }
}

export function isRunning(name: string): boolean {
  return running.has(name);
}
