import { users } from '../../db';
import { verifyPlayer } from '../../clients/kingshot';
import { queueAndRedeem } from '../../services/queueWorker';
import { refreshProfile } from '../../services/playerLookup';
import { parseFid, parseKingdom } from '../../utils/player';
import { logger } from '../../utils/logger';

const VERIFY_ERRORS = {
  WRONG_KINGDOM: '왕국 번호가 플레이어 ID와 일치하지 않습니다. 왕국 번호를 확인해 주세요.',
  NO_SUCH_PLAYER: '존재하지 않는 플레이어 ID입니다.',
  UNVERIFIED: '플레이어 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
} as const;

// New and re-verified users go ahead of the regular queue
const REGISTRATION_PRIORITY = 10;

/**
 * Register a player (or update its kingdom / reactivate it). The fid/kid pair is verified first;
 * the codes the player still needs are then queued with high priority and redeemed in the background.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const fid = parseFid(body?.fid);
  const kid = parseKingdom(body?.kid);

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID must be numeric' });
  }
  if (!kid) {
    throw createError({ statusCode: 400, message: 'Kingdom number must be numeric' });
  }

  const existingUser = users.findByFid(fid);

  // Already registered and active with the same, already verified kingdom: nothing to verify.
  // A deactivated user registering again goes through verification and is reactivated below.
  if (existingUser && existingUser.active === 1 && kid === existingUser.kingdom && existingUser.kingdom_verified_at) {
    return {
      success: true,
      message: 'User already registered',
      user: existingUser,
      queuedCount: 0,
      alreadyRegistered: true,
      kidUpdated: false
    };
  }

  // New user, kingdom change, or a kingdom never verified: verify the fid/kid pair before saving it
  const verification = await verifyPlayer(fid, kid);
  if (!verification.ok) {
    logger.warn(`❌ Rejected registration for ${fid} (kid ${kid}): ${verification.status}`);
    throw createError({
      statusCode: 422,
      message: VERIFY_ERRORS[verification.reason],
      data: { reason: verification.reason, message: VERIFY_ERRORS[verification.reason] }
    });
  }

  if (!existingUser) {
    users.create(fid, null, 1);
  }
  users.setVerifiedKingdom(fid, kid);
  const reactivated = existingUser !== undefined && existingUser.active !== 1;
  // The user asked for redemptions again, so a deactivated account (by an admin or the lookup) comes back
  if (reactivated) users.updateActive(fid, 1);
  // Nickname and avatar in the background, so registration does not wait on the lookup site
  void refreshProfile(fid, false);

  // Codes that failed with the old (or unverified) kingdom are queued again too
  const queuedCount = queueAndRedeem({ fid, priority: REGISTRATION_PRIORITY });

  if (!existingUser) {
    logger.info(`✅ User registered: ${fid} (kid ${kid}), ${queuedCount} code(s) queued`);
    return { success: true, message: 'User registered successfully', user: users.findByFid(fid), queuedCount };
  }

  const kidUpdated = kid !== existingUser.kingdom;
  logger.info(`✅ ${reactivated ? 'Reactivated' : kidUpdated ? 'Updated kingdom for' : 'Verified kingdom for'} ${fid}: ${existingUser.kingdom} -> ${kid}, ${queuedCount} code(s) queued`);
  return {
    success: true,
    message: reactivated ? 'User reactivated' : kidUpdated ? 'Kingdom updated' : 'User already registered',
    user: users.findByFid(fid),
    queuedCount,
    alreadyRegistered: true,
    kidUpdated,
    reactivated
  };
});
