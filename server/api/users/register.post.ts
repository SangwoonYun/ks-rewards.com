import { users } from '../../utils/db';
import { verifyPlayer } from '../../services/kingshotApi';
import { redeemNowForUser } from '../../services/redemptionService';
import { refreshProfile } from '../../services/playerLookup';
import { logger } from '../../utils/logger';

const VERIFY_ERRORS = {
  WRONG_KINGDOM: '왕국 번호가 플레이어 ID와 일치하지 않습니다. 왕국 번호를 확인해 주세요.',
  NO_SUCH_PLAYER: '존재하지 않는 플레이어 ID입니다.',
  UNVERIFIED: '플레이어 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
} as const;

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { fid, kid } = body;

    if (!fid) {
      return {
        success: false,
        error: 'FID is required'
      };
    }

    if (!kid) {
      return {
        success: false,
        error: 'Kingdom number (kid) is required'
      };
    }

    // Validate FID and kid format
    if (!/^\d+$/.test(fid)) {
      return {
        success: false,
        error: 'FID must be numeric'
      };
    }

    if (!/^\d+$/.test(String(kid))) {
      return {
        success: false,
        error: 'Kingdom number must be numeric'
      };
    }

    const existingUser = await users.findByFid(fid);

    // Already registered and active with the same, already verified kingdom: nothing to verify.
    // A deactivated user registering again goes through verification and is reactivated below.
    if (existingUser && existingUser.active === 1 && String(kid) === existingUser.kingdom && existingUser.kingdom_verified_at) {
      return {
        success: true,
        message: 'User already registered',
        user: existingUser,
        redeemedCount: 0,
        alreadyRegistered: true,
        kidUpdated: false
      };
    }

    // New user, kingdom change, or a kingdom never verified: verify the fid/kid pair before saving it
    const verification = await verifyPlayer(fid, String(kid));
    if (!verification.ok) {
      logger.warn(`❌ Rejected registration for ${fid} (kid ${kid}): ${verification.status}`);
      return {
        success: false,
        error: VERIFY_ERRORS[verification.reason],
        reason: verification.reason
      };
    }

    if (existingUser) {
      const kidUpdated = String(kid) !== existingUser.kingdom;
      const reactivated = existingUser.active !== 1;
      await users.setVerifiedKingdom(fid, String(kid));
      // The user asked for redemptions again, so a deactivated account (by an admin or the lookup) comes back
      if (reactivated) {
        users.updateActive(fid, 1);
        logger.info(`✅ Reactivated ${fid} on registration`);
      }
      void refreshProfile(fid, false);
      logger.info(kidUpdated
        ? `✅ Updated kingdom for ${fid}: ${existingUser.kingdom} -> ${kid}`
        : `✅ Verified kingdom for ${fid}: ${kid}`);

      // Retry codes that failed with the old (or unverified) kingdom
      const redeemedCount = await redeemNowForUser(fid, String(kid));

      return {
        success: true,
        message: reactivated ? 'User reactivated' : kidUpdated ? 'Kingdom updated' : 'User already registered',
        user: {
          ...existingUser,
          kingdom: String(kid),
          active: 1
        },
        redeemedCount,
        alreadyRegistered: true,
        kidUpdated,
        reactivated
      };
    }

    // Create new user
    await users.create(fid, null, 1);
    await users.setVerifiedKingdom(fid, String(kid));
    // Nickname and avatar in the background, so registration does not wait on the lookup site
    void refreshProfile(fid, false);
    const user = await users.findByFid(fid);

    logger.info(`✅ User registered: ${fid} (kid ${kid})`);

    const redeemedCount = await redeemNowForUser(fid, String(kid));

    return {
      success: true,
      message: 'User registered successfully',
      user,
      redeemedCount
    };
  } catch (error: any) {
    logger.error('Error registering user:', error);
    return {
      success: false,
      error: 'Internal server error',
      message: error?.message || String(error)
    };
  }
});
