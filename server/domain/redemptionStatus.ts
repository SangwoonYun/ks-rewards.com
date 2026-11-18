/**
 * Redemption statuses (normalized: uppercase, spaces -> underscores) and what each one means.
 * Single source of truth: services and SQL queries take their status lists from here.
 */

// Redeemed (or already redeemed) for this player
export const SUCCESS_STATUSES = ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'];
// The code itself is dead for everyone
export const CODE_EXPIRED_STATUSES = ['TIME_ERROR', 'USED'];
export const CODE_INVALID_STATUSES = ['CDK_NOT_FOUND'];
// The code is valid but this player does not meet its requirements (permanent for this player)
export const PLAYER_INELIGIBLE_STATUSES = ['STOVE_LV_ERROR', 'RECHARGE_MONEY_ERROR', 'RECHARGE_MONEY_VIP_ERROR'];
// The fid/kid pair is wrong; checked by the API before it looks at the code
export const PLAYER_ERROR_STATUSES = ['USER_INFO_ERROR', 'ROLE_NOT_EXIST'];
// Worth retrying later
export const RETRYABLE_STATUSES = ['TIMEOUT_RETRY', 'TOO_FREQUENT'];
// Network/server-side problems: say nothing about the code or the player
export const TRANSIENT_STATUSES = ['NOT_LOGIN', 'SIGN_ERROR', 'INVALID_RESPONSE', 'ERROR', 'UNKNOWN'];

// Statuses the redeem API is known to return (anything else is unrecognized)
export const KNOWN_API_STATUSES = new Set([
  ...SUCCESS_STATUSES, ...CODE_EXPIRED_STATUSES, ...CODE_INVALID_STATUSES,
  ...PLAYER_INELIGIBLE_STATUSES, ...PLAYER_ERROR_STATUSES, ...RETRYABLE_STATUSES,
  'NOT_LOGIN', 'SIGN_ERROR'
]);

// Final, expected outcomes for a (player, code) pair: not a failure to act on
export const SETTLED_STATUSES = [
  ...SUCCESS_STATUSES, ...CODE_EXPIRED_STATUSES, ...CODE_INVALID_STATUSES, ...PLAYER_INELIGIBLE_STATUSES
];

// A (player, code) pair with one of these never needs to be queued again
export const NO_REQUEUE_STATUSES = [...SUCCESS_STATUSES, ...PLAYER_INELIGIBLE_STATUSES];

export type Outcome =
  | 'success'
  | 'ineligible'
  | 'codeExpired'
  | 'codeInvalid'
  | 'playerError'
  | 'retryable'
  | 'transient'
  | 'unknown';

/**
 * Normalize a status string: trim, drop trailing punctuation, uppercase, spaces -> underscores
 */
export function normalizeStatus(status: unknown): string {
  const normalized = String(status ?? '').trim().replace(/[.!?]+$/, '').toUpperCase().replace(/\s+/g, '_');
  return normalized || 'UNKNOWN';
}

export function classifyStatus(status: string): Outcome {
  if (SUCCESS_STATUSES.includes(status)) return 'success';
  if (PLAYER_INELIGIBLE_STATUSES.includes(status)) return 'ineligible';
  if (CODE_EXPIRED_STATUSES.includes(status)) return 'codeExpired';
  if (CODE_INVALID_STATUSES.includes(status)) return 'codeInvalid';
  if (PLAYER_ERROR_STATUSES.includes(status)) return 'playerError';
  if (RETRYABLE_STATUSES.includes(status)) return 'retryable';
  if (TRANSIENT_STATUSES.includes(status)) return 'transient';
  return 'unknown';
}

/**
 * Whether a (player, code) pair is done after this outcome (nothing left to retry)
 */
export function isSettled(outcome: Outcome): boolean {
  return outcome === 'success' || outcome === 'ineligible' || outcome === 'codeExpired' || outcome === 'codeInvalid';
}
