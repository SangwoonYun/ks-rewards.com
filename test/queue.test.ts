import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, queue, redemptions, giftCodes, priorityUsers } from '../server/db';
import { sqliteNow } from '../server/db/sql';
import { resetDb, addUser, addCode, queueRows } from './helpers';

const redeem = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../server/clients/kingshot', () => ({ redeemGiftCode: redeem.fn }));

const { executeQueueItem, MAX_QUEUE_ATTEMPTS } = await import('../server/services/redemptionExecutor');

beforeEach(() => {
  resetDb();
  redeem.fn.mockReset();
});

const respond = (status: string) => redeem.fn.mockResolvedValue({ success: ['SUCCESS', 'RECEIVED'].includes(status), status, message: status });

describe('queue.enqueue', () => {
  it('queues active users x validated codes, skipping redeemed and ineligible pairs', () => {
    addUser('1');
    addUser('2');
    addUser('3', '100', { active: 0 });
    addCode('A');
    addCode('B');
    addCode('P', 'pending');
    redemptions.create('1', 'A', 'RECEIVED');
    redemptions.create('2', 'B', 'STOVE_LV_ERROR');

    expect(queue.enqueue()).toBe(2);
    expect(queueRows().map(r => `${r.fid}${r.code}`).sort()).toEqual(['1B', '2A']);
  });

  it('skips an unverified kingdom mismatch unless asked to retry it', () => {
    addUser('1');
    addCode('A');
    redemptions.create('1', 'A', 'USER_INFO_ERROR');

    expect(queue.enqueue({ fid: '1' })).toBe(0);
    expect(queue.enqueue({ fid: '1', retryKingdomMismatch: true })).toBe(1);
  });

  it('queues a mismatch again once the kingdom is verified after it', () => {
    addUser('1');
    addCode('A');
    db.prepare("INSERT INTO redemptions (fid, code, status, redeemed_at) VALUES ('1', 'A', 'USER_INFO_ERROR', '2026-01-01 00:00:00')").run();
    db.prepare("UPDATE users SET kingdom_verified_at = '2026-01-02 00:00:00' WHERE fid = '1'").run();

    expect(queue.enqueue({ fid: '1' })).toBe(1);
  });

  it('narrows to one code and uses the higher of the given and the priority-user priority', () => {
    addUser('1');
    addUser('2');
    addCode('A');
    addCode('B');
    priorityUsers.add('2', 20);

    expect(queue.enqueue({ code: 'A', priority: 5 })).toBe(2);
    const rows = queueRows();
    expect(rows.every(r => r.code === 'A')).toBe(true);
    expect(rows.find(r => r.fid === '1')!.priority).toBe(5);
    expect(rows.find(r => r.fid === '2')!.priority).toBe(20);
  });

  it('gives a failed item a fresh retry budget and leaves a processing one alone', () => {
    addUser('1');
    addUser('2');
    addCode('A');
    queue.enqueue();
    db.prepare("UPDATE redemption_queue SET status = 'failed', attempts = 3 WHERE fid = '1'").run();
    db.prepare("UPDATE redemption_queue SET status = 'processing', attempts = 1 WHERE fid = '2'").run();

    queue.enqueue();
    const rows = queueRows();
    expect(rows.find(r => r.fid === '1')).toMatchObject({ status: 'pending', attempts: 0 });
    expect(rows.find(r => r.fid === '2')).toMatchObject({ status: 'processing', attempts: 1 });
  });
});

describe('queue.claimNext', () => {
  it('claims each pending item once, highest priority first, counting the attempt', () => {
    addUser('1');
    addUser('2');
    addCode('A');
    queue.enqueue({ fid: '1' });
    queue.enqueue({ fid: '2', priority: 10 });

    const start = sqliteNow(new Date(Date.now() + 1000));
    const first = queue.claimNext(start)!;
    const second = queue.claimNext(start)!;
    expect([first.fid, second.fid]).toEqual(['2', '1']);
    expect(first).toMatchObject({ status: 'processing', attempts: 1 });
    // Nothing left: a second worker cannot take the same items
    expect(queue.claimNext(start)).toBeUndefined();
  });

  it('leaves an item retried during the current run for the next run', () => {
    addUser('1');
    addCode('A');
    queue.enqueue();
    const start = sqliteNow(new Date(Date.now() - 5000));
    const item = queue.claimNext(start)!;
    queue.setStatus(item.id, 'pending', 'TOO_FREQUENT');

    expect(queue.claimNext(start)).toBeUndefined();
    expect(queue.claimNext(sqliteNow(new Date(Date.now() + 5000)))?.id).toBe(item.id);
  });
});

describe('executeQueueItem', () => {
  const claim = () => queue.claimNext(sqliteNow(new Date(Date.now() + 1000)))!;

  beforeEach(() => {
    addUser('1');
    addUser('2');
    addCode('A');
    queue.enqueue();
  });

  it('removes a redeemed item and records the result', async () => {
    respond('SUCCESS');
    const result = await executeQueueItem(claim());
    expect(result.success).toBe(true);
    expect(queueRows().map(r => r.fid)).toEqual(['2']);
    expect(redemptions.findLatest('1', 'A')!.status).toBe('SUCCESS');
  });

  it('marks an expired code and drops its whole queue', async () => {
    respond('TIME_ERROR');
    await executeQueueItem(claim());
    expect(giftCodes.findByCode('A')!.validation_status).toBe('expired');
    expect(queueRows()).toEqual([]);
  });

  it('keeps a retryable item pending until the attempts run out', async () => {
    respond('TOO_FREQUENT');
    const item = claim();
    await executeQueueItem(item);
    expect(queueRows().find(r => r.fid === item.fid)!.status).toBe('pending');

    db.prepare('UPDATE redemption_queue SET attempts = ? WHERE id = ?').run(MAX_QUEUE_ATTEMPTS, item.id);
    await executeQueueItem({ ...item, attempts: MAX_QUEUE_ATTEMPTS });
    expect(queueRows().find(r => r.fid === item.fid)!.status).toBe('failed');
  });

  it('retries USER_INFO_ERROR, then fails it as a kingdom mismatch', async () => {
    respond('USER_INFO_ERROR');
    const item = claim();
    await executeQueueItem(item);
    expect(queueRows().find(r => r.fid === item.fid)!.status).toBe('pending');
    await executeQueueItem({ ...item, attempts: MAX_QUEUE_ATTEMPTS });
    expect(queueRows().find(r => r.fid === item.fid)!.status).toBe('failed');
  });

  it('fails a permanent player error right away', async () => {
    respond('ROLE_NOT_EXIST');
    const item = claim();
    await executeQueueItem(item);
    expect(queueRows().find(r => r.fid === item.fid)!.status).toBe('failed');
  });

  it('never redeems for an inactive user', async () => {
    const item = claim();
    db.prepare('UPDATE users SET active = 0 WHERE fid = ?').run(item.fid);
    const result = await executeQueueItem(item);
    expect(result.status).toBe('INACTIVE');
    expect(redeem.fn).not.toHaveBeenCalled();
  });

  it('validates a pending code when a redemption works', async () => {
    db.prepare("UPDATE gift_codes SET validation_status = 'pending'").run();
    respond('RECEIVED');
    await executeQueueItem(claim());
    expect(giftCodes.findByCode('A')!.validation_status).toBe('validated');
  });
});
