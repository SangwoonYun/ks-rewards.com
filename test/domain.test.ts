import { describe, it, expect } from 'vitest';
import { classifyStatus, normalizeStatus, isSettled } from '../server/domain/redemptionStatus';
import { parseGiftCodeLine, parseCodeDate } from '../server/clients/giftCodeSource';
import { parseFid, parseKingdom } from '../server/utils/player';

describe('redemption statuses', () => {
  it('normalizes API messages', () => {
    expect(normalizeStatus('Same Type Exchange.')).toBe('SAME_TYPE_EXCHANGE');
    expect(normalizeStatus('  TIMEOUT RETRY ')).toBe('TIMEOUT_RETRY');
    expect(normalizeStatus('')).toBe('UNKNOWN');
    expect(normalizeStatus(undefined)).toBe('UNKNOWN');
  });

  it('classifies every status group', () => {
    expect(classifyStatus('RECEIVED')).toBe('success');
    expect(classifyStatus('STOVE_LV_ERROR')).toBe('ineligible');
    expect(classifyStatus('TIME_ERROR')).toBe('codeExpired');
    expect(classifyStatus('USED')).toBe('codeExpired');
    expect(classifyStatus('CDK_NOT_FOUND')).toBe('codeInvalid');
    expect(classifyStatus('USER_INFO_ERROR')).toBe('playerError');
    expect(classifyStatus('TOO_FREQUENT')).toBe('retryable');
    expect(classifyStatus('ERROR')).toBe('transient');
    expect(classifyStatus('SOMETHING_NEW')).toBe('unknown');
  });

  it('settles only final outcomes', () => {
    expect(isSettled('success')).toBe(true);
    expect(isSettled('codeInvalid')).toBe(true);
    expect(isSettled('retryable')).toBe(false);
    expect(isSettled('playerError')).toBe(false);
  });
});

describe('gift code lines', () => {
  it('parses codes with and without a date', () => {
    expect(parseGiftCodeLine('ABC123 05.03.2026')).toEqual({ code: 'ABC123', date: '2026-03-05T12:00:00.000Z' });
    expect(parseGiftCodeLine('  ABC123  ')).toEqual({ code: 'ABC123' });
    expect(parseGiftCodeLine('ABC123 notadate')).toEqual({ code: 'ABC123' });
  });

  it('rejects lines that are not codes', () => {
    expect(parseGiftCodeLine('ABC-123')).toBeNull();
    expect(parseGiftCodeLine('A B C')).toBeNull();
    expect(parseGiftCodeLine('')).toBeNull();
    expect(parseCodeDate('2026-03-05')).toBeNull();
  });
});

describe('ids from requests', () => {
  it('accepts numeric strings and numbers', () => {
    expect(parseFid(' 12345 ')).toBe('12345');
    expect(parseFid(12345)).toBe('12345');
    expect(parseFid('12a')).toBeNull();
    expect(parseFid(undefined)).toBeNull();
  });

  it('normalizes kingdom numbers', () => {
    expect(parseKingdom('0710')).toBe('710');
    expect(parseKingdom(710)).toBe('710');
    expect(parseKingdom('0')).toBeNull();
    expect(parseKingdom('x')).toBeNull();
  });
});
