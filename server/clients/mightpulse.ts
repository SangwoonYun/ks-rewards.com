import axios from 'axios';

// Player lookup on mightpulse.com (undocumented site API). Cached data first (live=0); live=1 makes the
// site query ~200 kingdoms on the spot (~12s), so it is only the fallback for players not in the cache.
const LOOKUP_URL = 'https://mightpulse.com/api/search';
const LIVE_TIMEOUT_MS = 30000;

export interface PlayerProfile {
  kid: number | null;
  nickname: string | null;
  avatarUrl: string | null;   // null for the game's default avatars (served by mightpulse as relative paths)
  inactive: boolean;          // not logged in for 90 days, or no city coordinates
}

async function searchPlayer(fid: string, live: boolean): Promise<any> {
  const { data } = await axios.get(LOOKUP_URL, {
    params: { q: fid, limit: 40, live: live ? 1 : 0 },
    timeout: live ? LIVE_TIMEOUT_MS : 5000
  });
  if (!Array.isArray(data?.results)) throw new Error('Unexpected response');

  // The search also matches other fields (e.g. uid), so only an exact fid counts
  return data.results.find((r: any) => String(r?.fid) === fid);
}

/**
 * The player's profile according to mightpulse.com, from its cached data or else a live search.
 * undefined when neither finds the player, throws on request failure.
 */
export async function lookupPlayer(fid: string): Promise<PlayerProfile | undefined> {
  const player = await searchPlayer(fid, false) ?? await searchPlayer(fid, true);
  if (!player) return undefined;

  const kid = Number(player.kid);
  const nickname = typeof player.nick_name === 'string' ? player.nick_name.trim() : '';
  const avatarUrl = typeof player.avatar_url === 'string' && /^https?:\/\//.test(player.avatar_url) ? player.avatar_url : null;
  return {
    kid: Number.isInteger(kid) && kid >= 1 ? kid : null,
    nickname: nickname || null,
    avatarUrl,
    // Fields missing from the response (format change) never count, only explicit values
    // An unknown last login does not count: such players can still be active
    inactive: player.inactive_90d === true
      || (player.x === null && player.y === null)
  };
}
