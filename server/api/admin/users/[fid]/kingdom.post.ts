import { users } from '../../../../db';
import { verifyPlayer } from '../../../../clients/kingshot';
import { queueAndRedeem } from '../../../../services/queueWorker';
import { requireFidParam } from '../../../../utils/http';
import { parseKingdom } from '../../../../utils/player';
import { logger } from '../../../../utils/logger';

const VERIFY_ERRORS = {
  WRONG_KINGDOM: 'Kingdom does not match this player ID',
  NO_SUCH_PLAYER: 'Player ID does not exist',
  UNVERIFIED: 'Could not verify the player, try again later'
} as const;

/**
 * Change a user's kingdom. The fid/kid pair is verified first and nothing is
 * saved if verification fails.
 */
export default defineEventHandler(async (event) => {
  const fid = requireFidParam(event);
  const body = await readBody(event).catch(() => null);
  const kid = parseKingdom(body?.kid);

  if (!kid) {
    throw createError({ statusCode: 400, message: 'Kingdom number must be numeric' });
  }

  const user = users.findByFid(fid);
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }

  const verification = await verifyPlayer(fid, kid);
  if (!verification.ok) {
    logger.warn(`Admin kingdom change rejected for ${fid} (kid ${kid}): ${verification.status}`);
    return {
      success: false,
      kingdom: user.kingdom,
      reason: verification.reason,
      message: VERIFY_ERRORS[verification.reason]
    };
  }

  users.setVerifiedKingdom(fid, kid);
  // Codes that failed with the old kingdom are queued again
  const queuedCount = queueAndRedeem({ fid, priority: 10 });
  logger.info(`Admin updated kingdom for ${fid}: ${user.kingdom} -> ${kid}, ${queuedCount} code(s) queued`);

  return {
    success: true,
    kingdom: kid,
    queuedCount,
    message: `Kingdom updated, ${queuedCount} code(s) queued`
  };
});
