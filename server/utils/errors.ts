/**
 * Get a clean error message from any error object
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const anyError = error as any;
    if (anyError.message) {
      return anyError.message;
    }
    if (anyError.error) {
      return anyError.error;
    }
  }
  return String(error);
}

