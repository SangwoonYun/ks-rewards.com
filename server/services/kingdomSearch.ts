import { users } from '../db';
import { getErrorMessage } from '../utils/errors';
import { verifyPlayer, searchRateLimiter } from '../clients/kingshot';
import { ipRateLimit } from '../clients/rateLimiter';
import { fetchMaxKingdom } from '../clients/kingdomTracker';
import { queueAndRedeem } from './queueWorker';
import { lookupPlayer, saveProfile } from './playerLookup';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { sleep } from '../utils/sleep';

/**
 * Background search for the new kingdom of users who were likely transferred.
 *
 * Each user's own search order is outward from the kingdom on record:
 * K, K+1, K-1, K+2, K-2, ... up to K±MAX_DISTANCE (never below 1, nor above the highest existing
 * kingdom from kingshot.net's kingdom tracker when it is reachable). Alternating
 * both ways matters because the allowed transfer range changes every event.
 *
 * Alongside the search, every user is looked up once on mightpulse.com (see runLookups), which also
 * refreshes the nickname and avatar. The kingdom it returns is tried before anything else, like a
 * group hint; a wrong or missing result just leaves the normal search below to run.
 *
 * Users who share an original kingdom form a group (alliances tend to move together):
 * 1. Only SCOUTS_PER_GROUP unresolved members explore (check the kingdom on record, then
 *    walk the outward search); the rest wait without sending requests.
 * 2. A kingdom found by any member (including "the kingdom on record is still valid")
 *    becomes a hint: every other member tries it first, most-confirmed hints first, and
 *    hint requests are sent ahead of exploration. Members a hint does not fit become
 *    explorers themselves when a scout slot is free.
 * Only found kingdoms are shared: a kingdom wrong for one member may be right for another.
 *
 * Groups start in original-kingdom order, and only as many as needed to keep the search
 * rate limiter busy: a new group starts when the running groups have fewer users able to send
 * than PER_FID_INTERVAL_MS / current interval (+ SENDER_MARGIN). Users in a TOO_FREQUENT
 * cooldown do not count, so a group left with a single slow searcher does not block the next one.
 *
 * Requests go through a dedicated search rate limiter (base SEARCH_REQUEST_INTERVAL_MS).
 * Its interval grows by STEP_MS on each IP-level rate-limit signal (HTTP 429 on any request from
 * this server, or several different FIDs hitting TOO_FREQUENT within a minute) and shrinks by
 * STEP_MS after RECOVERY_QUIET_MS without signals, down to the base. Steps back down to (or below)
 * an interval that got an HTTP 429 need RETRY_429_QUIET_MS instead, so the search does not keep
 * bouncing off the limit. During a 429's Retry-After every request waits (see ipRateLimit in clients/rateLimiter).
 *
 * Users are interleaved round-robin so a single FID is not hammered (the API rate-limits per FID).
 */

const MAX_DISTANCE = 500;

// Player lookup (see playerLookup): sequential and slow on purpose; a few failures in a row
// turn it off for the rest of the search.
const LOOKUP_INTERVAL_MS = 1500;
const LOOKUP_MAX_CONSECUTIVE_FAILURES = 3;
const SCOUTS_PER_GROUP = 2;
const MAX_ACTIVE_GROUPS = 20;             // hard cap on groups running at once
const SENDER_MARGIN = 2;                  // extra senders beyond the minimum to cover per-FID slack
const PER_FID_INTERVAL_MS = 10_000;        // min gap between requests for the same FID (API rate-limits per FID)
const TOO_FREQUENT_COOLDOWN_MS = 60_000;   // per-FID cooldown after TOO_FREQUENT
const MAX_CONSECUTIVE_COOLDOWNS = 5;
const MAX_TRANSIENT_FAILURES = 3;

// Adaptive search interval
const MAX_SEARCH_INTERVAL_MS = 16_000;
const STEP_MS = 1000;                     // +1s per signal, -1s per quiet period
const IP_SIGNAL_WINDOW_MS = 60_000;       // TOO_FREQUENT from this many distinct FIDs within the window = IP-level signal
const IP_SIGNAL_DISTINCT_FIDS = 3;
const RECOVERY_QUIET_MS = 5 * 60_000;     // quiet time before stepping down
const RETRY_429_QUIET_MS = 30 * 60_000;   // quiet time before stepping down to an interval that got an HTTP 429

export type SearchStatus =
  | 'queued'       // group not started yet (see groupActive), or about to send its first request
  | 'waiting'      // waiting for the group's scouts to find a kingdom
  | 'searching'
  | 'found'
  | 'not_found'
  | 'no_player'
  | 'aborted'
  | 'cancelled';

export interface UserSearch {
  fid: string;
  originalKingdom: string | null;
  status: SearchStatus;
  currentKingdom: number | null;   // kingdom being tried
  tried: number;
  total: number;
  foundKingdom: string | null;
  foundViaGroup: boolean;          // found by trying a kingdom another group member was found in
  foundViaLookup: boolean;         // found by trying the kingdom the player lookup returned
  groupActive: boolean;            // the user's group has started (see planRound)
  queuedCount: number | null;      // codes queued for redemption once found
  cooldownUntil: number | null;
  message: string | null;
}

interface InternalSearch extends UserSearch {
  candidates: number[];
  checked: Set<number>;    // kingdoms already rejected (or accepted) for this FID
  index: number;           // position in candidates for the outward search
  transientFailures: number;
  consecutiveCooldowns: number;
  nextRequestAt: number;   // earliest time the next request for this FID may be sent
  lookupKingdom: number | null;   // kingdom from the player lookup, tried before everything else
}

interface NextKingdom {
  kid: number;
  kind: 'lookup' | 'hint' | 'current' | 'search';
}

// Lookup results and group hints: sent ahead of exploration and not limited by SCOUTS_PER_GROUP
const isHint = (next: NextKingdom) => next.kind === 'lookup' || next.kind === 'hint';

interface SearchJob {
  running: boolean;
  cancelRequested: boolean;
  startedAt: number;
  finishedAt: number | null;
  users: InternalSearch[];
  // original kingdom -> kingdom found -> number of members found there
  groupFinds: Map<string, Map<number, number>>;
  activeGroups: Set<string>;               // groups started (stay started until finished)
  targetSenders: number;
  // Adaptive interval
  baseIntervalMs: number;
  last429IntervalMs: number | null;        // highest interval that got an HTTP 429 in this search
  lastSignalAt: number;
  lastStepAt: number;                      // last interval change
  seenRateLimitHits: number;
  tooFrequentLog: { fid: string; at: number }[];
  backoffs: number;
}

let job: SearchJob | null = null;

/**
 * Look up every user once, in group order, while the search runs. A kingdom found becomes the
 * user's first try; the nickname and avatar are saved as well.
 */
async function runLookups(current: SearchJob) {
  const queue = [...current.users].sort((a, b) => Number(a.originalKingdom) - Number(b.originalKingdom));
  let failures = 0;
  let hits = 0;

  for (const u of queue) {
    if (!current.running || current.cancelRequested) return;
    // Already resolved, or its group already started without needing it
    if (!isActive(u)) continue;

    try {
      const profile = await lookupPlayer(u.fid);
      failures = 0;
      if (profile) saveProfile(u.fid, profile);
      if (profile?.kid) {
        u.lookupKingdom = profile.kid;
        hits++;
      }
    } catch (error) {
      failures++;
      logger.warn(`🔎 Kingdom search: player lookup failed for ${u.fid}: ${getErrorMessage(error)}`);
      if (failures >= LOOKUP_MAX_CONSECUTIVE_FAILURES) {
        logger.warn(`🔎 Kingdom search: player lookup turned off after ${failures} failures in a row`);
        return;
      }
    }
    await sleep(LOOKUP_INTERVAL_MS);
  }
  logger.info(`🔎 Kingdom search: player lookup finished, ${hits} kingdom(s) found`);
}

function buildCandidates(kingdom: number, maxKingdom: number | null): number[] {
  const candidates = [kingdom];
  for (let d = 1; d <= MAX_DISTANCE; d++) {
    if (maxKingdom === null || kingdom + d <= maxKingdom) candidates.push(kingdom + d);
    if (kingdom - d >= 1) candidates.push(kingdom - d);
  }
  return candidates;
}

function isActive(u: InternalSearch) {
  return u.status === 'queued' || u.status === 'waiting' || u.status === 'searching';
}

/**
 * The kingdom this user should try next, or null when every candidate was checked.
 * The player lookup result comes first, then group hints (a member is likely where the group went), then the kingdom on record,
 * then the outward search.
 */
function nextKingdom(current: SearchJob, u: InternalSearch): NextKingdom | null {
  const home = u.candidates[0]!;

  if (u.lookupKingdom !== null && !u.checked.has(u.lookupKingdom)) {
    return { kid: u.lookupKingdom, kind: 'lookup' };
  }

  // Kingdoms other group members were found in, most-confirmed first, then closest
  const finds = current.groupFinds.get(u.originalKingdom!);
  if (finds) {
    const hint = [...finds.entries()]
      .filter(([kid]) => !u.checked.has(kid))
      .sort(([a, ca], [b, cb]) => cb - ca || Math.abs(a - home) - Math.abs(b - home))[0];
    if (hint) {
      return { kid: hint[0], kind: 'hint' };
    }
  }

  if (!u.checked.has(home)) {
    return { kid: home, kind: 'current' };
  }

  while (u.index < u.candidates.length && u.checked.has(u.candidates[u.index]!)) {
    u.index++;
  }
  return u.index < u.candidates.length ? { kid: u.candidates[u.index]!, kind: 'search' } : null;
}

/**
 * Decide who may send a request now. Groups are visited in original-kingdom order; started groups
 * always run, and the next group starts only while the started ones have fewer ready senders than
 * the target (see header). Within a group: every member with a group hint to try, plus the first
 * SCOUTS_PER_GROUP members still exploring (own kingdom check or outward search).
 * Returns the next kingdom for every user allowed to search.
 */
function planRound(current: SearchJob): Map<InternalSearch, NextKingdom> {
  const plan = new Map<InternalSearch, NextKingdom>();
  const now = Date.now();
  current.targetSenders = Math.ceil(PER_FID_INTERVAL_MS / searchRateLimiter.intervalMs) + SENDER_MARGIN;

  const byGroup = new Map<string, InternalSearch[]>();
  for (const u of current.users) {
    if (!isActive(u)) continue;
    const members = byGroup.get(u.originalKingdom!) ?? [];
    members.push(u);
    byGroup.set(u.originalKingdom!, members);
  }
  const unfinishedGroups = [...byGroup.keys()].sort((a, b) => Number(a) - Number(b));
  for (const group of current.activeGroups) {
    if (!byGroup.has(group)) current.activeGroups.delete(group);
  }

  let senders = 0;   // planned users not cooling down
  for (const group of unfinishedGroups) {
    const members = byGroup.get(group)!;

    if (!current.activeGroups.has(group)) {
      if (senders >= current.targetSenders || current.activeGroups.size >= MAX_ACTIVE_GROUPS) {
        for (const u of members) {
          u.groupActive = false;
          u.status = 'queued';
        }
        continue;
      }
      current.activeGroups.add(group);
      logger.info(`🔎 Kingdom search: starting group K${group} (${members.length} user(s), ${current.activeGroups.size} group(s) running)`);
    }

    let scouts = 0;
    for (const u of members) {
      u.groupActive = true;

      const next = nextKingdom(current, u);
      if (!next) {
        u.status = 'not_found';
        u.currentKingdom = null;
        logger.info(`🔎 Kingdom search: ${u.fid} not found within ±${MAX_DISTANCE} of ${u.originalKingdom}`);
        continue;
      }

      if (!isHint(next)) {
        if (scouts >= SCOUTS_PER_GROUP) {
          u.status = 'waiting';
          u.currentKingdom = null;
          continue;
        }
        scouts++;
      }

      if (u.status === 'waiting') u.status = 'queued';
      plan.set(u, next);
      if ((u.cooldownUntil ?? 0) <= now) senders++;
    }
  }

  return plan;
}

/**
 * Slow the search down on IP-level rate-limit signals, and speed back up after a quiet period
 */
function adjustInterval(current: SearchJob) {
  const now = Date.now();
  let signal: string | null = null;

  if (ipRateLimit.hits > current.seenRateLimitHits) {
    signal = 'HTTP 429';
    current.seenRateLimitHits = ipRateLimit.hits;
    current.last429IntervalMs = Math.max(current.last429IntervalMs ?? 0, searchRateLimiter.intervalMs);
  }

  current.tooFrequentLog = current.tooFrequentLog.filter(e => now - e.at <= IP_SIGNAL_WINDOW_MS);
  const distinctFids = new Set(current.tooFrequentLog.map(e => e.fid)).size;
  if (!signal && distinctFids >= IP_SIGNAL_DISTINCT_FIDS) {
    signal = `TOO_FREQUENT from ${distinctFids} FIDs within ${IP_SIGNAL_WINDOW_MS / 1000}s`;
  }

  if (signal) {
    current.lastSignalAt = now;
    current.tooFrequentLog = [];
    if (searchRateLimiter.intervalMs < MAX_SEARCH_INTERVAL_MS) {
      searchRateLimiter.intervalMs = Math.min(searchRateLimiter.intervalMs + STEP_MS, MAX_SEARCH_INTERVAL_MS);
      current.lastStepAt = now;
      current.backoffs++;
      logger.warn(`🔎 Kingdom search: ${signal}, slowing down to ${searchRateLimiter.intervalMs}ms per request`);
    }
    return;
  }

  if (searchRateLimiter.intervalMs <= current.baseIntervalMs) return;

  const target = Math.max(searchRateLimiter.intervalMs - STEP_MS, current.baseIntervalMs);
  const quietNeeded = current.last429IntervalMs !== null && target <= current.last429IntervalMs
    ? RETRY_429_QUIET_MS
    : RECOVERY_QUIET_MS;
  if (now - Math.max(current.lastSignalAt, current.lastStepAt) >= quietNeeded) {
    searchRateLimiter.intervalMs = target;
    current.lastStepAt = now;
    logger.info(`🔎 Kingdom search: no rate-limit signals for ${quietNeeded / 60000} min, speeding up to ${target}ms per request`);
  }
}

function recordGroupFind(current: SearchJob, u: InternalSearch, kid: number) {
  const group = u.originalKingdom!;
  const finds = current.groupFinds.get(group) ?? new Map<number, number>();
  finds.set(kid, (finds.get(kid) ?? 0) + 1);
  current.groupFinds.set(group, finds);
}

/**
 * One verification request for a user; updates its state
 */
async function step(current: SearchJob, u: InternalSearch, next: NextKingdom) {
  const { kid } = next;
  u.status = 'searching';
  u.currentKingdom = kid;

  const result = await verifyPlayer(u.fid, String(kid), searchRateLimiter);
  u.nextRequestAt = Date.now() + PER_FID_INTERVAL_MS;

  if (result.status === 'TOO_FREQUENT') {
    current.tooFrequentLog.push({ fid: u.fid, at: Date.now() });
    u.consecutiveCooldowns++;
    if (u.consecutiveCooldowns > MAX_CONSECUTIVE_COOLDOWNS) {
      u.status = 'aborted';
      u.message = `Still rate limited after ${MAX_CONSECUTIVE_COOLDOWNS} cooldowns`;
      return;
    }
    // Retry the same kingdom after the cooldown
    u.cooldownUntil = Date.now() + TOO_FREQUENT_COOLDOWN_MS;
    return;
  }
  u.consecutiveCooldowns = 0;
  u.cooldownUntil = null;

  if (result.ok) {
    u.checked.add(kid);
    u.tried = u.checked.size;
    u.foundKingdom = String(kid);
    u.foundViaGroup = next.kind === 'hint';
    u.foundViaLookup = next.kind === 'lookup';
    u.status = 'found';
    recordGroupFind(current, u, kid);

    users.setVerifiedKingdom(u.fid, String(kid));
    if (String(kid) !== u.originalKingdom) {
      const via = u.foundViaGroup ? ', group hint' : u.foundViaLookup ? ', player lookup' : '';
      logger.info(`🔎 Kingdom search: ${u.fid} found in kingdom ${kid} (was ${u.originalKingdom}${via})`);
    } else {
      logger.info(`🔎 Kingdom search: ${u.fid} is valid in its current kingdom ${kid}`);
    }

    // Codes that failed with the old kingdom are queued again and redeemed by the worker,
    // so the search goes on without waiting for them
    u.queuedCount = queueAndRedeem({ fid: u.fid, priority: 10 });
    return;
  }

  if (result.reason === 'WRONG_KINGDOM') {
    u.checked.add(kid);
    u.tried = u.checked.size;
    u.transientFailures = 0;
    return;
  }

  if (result.reason === 'NO_SUCH_PLAYER') {
    u.tried = u.checked.size + 1;
    u.status = 'no_player';
    u.message = result.status;
    logger.warn(`🔎 Kingdom search: ${u.fid} does not exist (${result.status})`);
    return;
  }

  // Transient / unknown: retry the same kingdom a few times
  u.transientFailures++;
  if (u.transientFailures >= MAX_TRANSIENT_FAILURES) {
    u.status = 'aborted';
    u.message = result.status;
    logger.warn(`🔎 Kingdom search: ${u.fid} aborted at kingdom ${kid} (${result.status})`);
  }
}

async function run(current: SearchJob) {
  let cursor = 0;

  try {
    while (!current.cancelRequested) {
      adjustInterval(current);
      const plan = planRound(current);
      if (plan.size === 0) break;   // no one left who can search (waiting users always have a scout ahead)

      // Next planned user in round-robin order that is not cooling down and whose per-FID interval has passed.
      // Lookup results and group hints go first: they are the requests most likely to resolve a user.
      const now = Date.now();
      const readyAt = (u: InternalSearch) => Math.max(u.nextRequestAt, u.cooldownUntil ?? 0);
      let picked: InternalSearch | null = null;
      for (const hintsOnly of [true, false]) {
        for (let i = 0; i < current.users.length; i++) {
          const u = current.users[(cursor + i) % current.users.length]!;
          const next = plan.get(u);
          if (next && (!hintsOnly || isHint(next)) && readyAt(u) <= now) {
            picked = u;
            cursor = (cursor + i + 1) % current.users.length;
            break;
          }
        }
        if (picked) break;
      }

      if (!picked) {
        // Everyone is waiting: sleep until the earliest user is ready (checking for cancel at least every second)
        const earliest = Math.min(...[...plan.keys()].map(readyAt));
        await sleep(Math.min(1000, Math.max(100, earliest - now)));
        continue;
      }

      try {
        await step(current, picked, plan.get(picked)!);
      } catch (error: any) {
        picked.status = 'aborted';
        picked.message = error?.message || String(error);
        logger.error(`🔎 Kingdom search error for ${picked.fid}:`, error);
      }
    }
  } finally {
    for (const u of current.users) {
      if (isActive(u)) {
        u.status = 'cancelled';
        u.currentKingdom = null;
        u.cooldownUntil = null;
      }
    }
    current.running = false;
    current.finishedAt = Date.now();
    logger.info('🔎 Kingdom search finished');
  }
}

export async function startKingdomSearch(fids: string[]) {
  // Fetched before the running check, so the check and the job assignment below stay synchronous
  const maxKingdom = await fetchMaxKingdom();

  if (job?.running) {
    throw createError({ statusCode: 409, message: 'A kingdom search is already running' });
  }

  const searches: InternalSearch[] = [...new Set(fids)].map(fid => {
    const user = users.findByFid(fid);
    const kingdom = parseInt(user?.kingdom ?? '', 10);
    const base: InternalSearch = {
      fid,
      originalKingdom: user?.kingdom ?? null,
      status: 'queued',
      currentKingdom: null,
      tried: 0,
      total: 0,
      foundKingdom: null,
      foundViaGroup: false,
      foundViaLookup: false,
      groupActive: false,
      queuedCount: null,
      cooldownUntil: null,
      message: null,
      candidates: [],
      checked: new Set(),
      index: 0,
      transientFailures: 0,
      consecutiveCooldowns: 0,
      nextRequestAt: 0,
      lookupKingdom: null
    };

    if (!user || Number.isNaN(kingdom)) {
      return { ...base, status: 'aborted' as const, message: user ? 'No kingdom on record' : 'User not found' };
    }
    const candidates = buildCandidates(kingdom, maxKingdom);
    // Normalize the group key (e.g. '0710' and '710' are the same kingdom)
    return { ...base, originalKingdom: String(kingdom), candidates, total: candidates.length };
  });

  job = {
    running: true,
    cancelRequested: false,
    startedAt: Date.now(),
    finishedAt: null,
    users: searches,
    groupFinds: new Map(),
    activeGroups: new Set(),
    targetSenders: 0,
    baseIntervalMs: config.retry.searchRequestIntervalMs,
    last429IntervalMs: null,
    lastSignalAt: 0,
    lastStepAt: 0,
    seenRateLimitHits: ipRateLimit.hits,
    tooFrequentLog: [],
    backoffs: 0
  };
  // Every new search starts from the configured base interval
  searchRateLimiter.intervalMs = job.baseIntervalMs;

  const groups = new Set(searches.map(u => u.originalKingdom)).size;
  logger.info(`🔎 Kingdom search started for ${searches.length} user(s) in ${groups} group(s), highest kingdom: ${maxKingdom ?? 'unknown'}`);
  run(job).catch(error => logger.error('🔎 Kingdom search error:', error));
  runLookups(job).catch(error => logger.error('🔎 Kingdom search: player lookup error:', error));
  return getKingdomSearchStatus();
}

export function cancelKingdomSearch() {
  if (job?.running) {
    job.cancelRequested = true;
    logger.info('🔎 Kingdom search cancel requested');
  }
  return getKingdomSearchStatus();
}

export function getKingdomSearchStatus() {
  return {
    running: job?.running ?? false,
    cancelRequested: job?.cancelRequested ?? false,
    startedAt: job?.startedAt ?? null,
    finishedAt: job?.finishedAt ?? null,
    intervalMs: searchRateLimiter.intervalMs,
    baseIntervalMs: job?.baseIntervalMs ?? config.retry.searchRequestIntervalMs,
    last429IntervalMs: job?.last429IntervalMs ?? null,
    pausedUntil: ipRateLimit.pausedUntil > Date.now() ? ipRateLimit.pausedUntil : null,
    backoffs: job?.backoffs ?? 0,
    perFidIntervalMs: PER_FID_INTERVAL_MS,
    activeGroups: job?.activeGroups.size ?? 0,
    targetSenders: job?.targetSenders ?? 0,
    users: (job?.users ?? []).map(
      ({ candidates, checked, index, transientFailures, consecutiveCooldowns, nextRequestAt, lookupKingdom, ...u }) => u
    )
  };
}
