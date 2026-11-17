import { users } from '../../../../utils/db';
import { verifyPlayer } from '../../../../services/kingshotApi';
import { redeemNowForUser } from '../../../../services/redemptionService';
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
  const fid = getRouterParam(event, 'fid');
  const { kid } = await readBody(event);

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }
  if (!kid || !/^\d+$/.test(String(kid))) {
    throw createError({ statusCode: 400, message: 'Kingdom number must be numeric' });
  }

  const user = users.findByFid(fid);
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }

  const verification = await verifyPlayer(fid, String(kid));
  if (!verification.ok) {
    logger.warn(`Admin kingdom change rejected for ${fid} (kid ${kid}): ${verification.status}`);
    return {
      success: false,
      kingdom: user.kingdom,
      reason: verification.reason,
      message: VERIFY_ERRORS[verification.reason]
    };
  }

  users.setVerifiedKingdom(fid, String(kid));
  logger.info(`Admin updated kingdom for ${fid}: ${user.kingdom} -> ${kid}`);

  // Retry codes that failed with the old kingdom
  const redeemedCount = await redeemNowForUser(fid, String(kid));

  return {
    success: true,
    kingdom: String(kid),
    redeemedCount,
    message: `Kingdom updated, ${redeemedCount} code(s) redeemed`
  };
});
