import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nightCounts } from '../src/digest/counts.js';
import { readNightLog } from '../src/digest/readNight.js';

// runs/ is read-only fixtures (AGENTS.md): every test writes its own night
// into a throwaway dir.
const dirs: string[] = [];

function tempRuns(night: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-counts-'));
  dirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), content, 'utf8');
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe('nightCounts', () => {
  it('counts the real 2026-10-28 night per line and agrees with the reader', () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-counts-'));
    dirs.push(runsDir);
    cpSync('runs/2026-10-28.jsonl', join(runsDir, '2026-10-28.jsonl'));

    expect(nightCounts(runsDir, '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });

    // the two readers must never disagree: every counted line is a folded
    // row line, every skipped one a bad line (10 + 4 + 1 = 15 rows.runs)
    const log = readNightLog(runsDir, '2026-10-28');
    expect(log?.badLines).toBe(1);
    expect(log?.rows.reduce((n, r) => n + r.runs, 0)).toBe(15);
  });

  it('counts by line, not by job: one job over many lines spreads across all three statuses', () => {
    const runsDir = tempRuns(
      '2026-10-30',
      [
        '{"at":"2026-10-30T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-10-30T23:01:00+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
        '{"at":"2026-10-30T23:02:00+01:00","job":"lane/sync","status":"fail","owner":"rook","error":"quota exceeded"}',
        '{"at":"2026-10-30T23:03:00+01:00","job":"lane/sync","status":"weird","owner":"rook"}',
        '{"at":"2026-10-30T23:04:00+01:00","job":"lane/sync","status":"ok","owner":42}',
      ].join('\n') + '\n',
    );
    // rows would say: one job, lastStatus 'fail'; the board says per line,
    // and the two bad lines (bad status, bad owner) are skipped, not counted
    expect(nightCounts(runsDir, '2026-10-30')).toEqual({ ok: 1, retry: 1, fail: 1 });
  });

  it('returns null for a night with no file and zeros for an empty one', () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-counts-'));
    dirs.push(runsDir);
    expect(nightCounts(runsDir, '1999-12-31')).toBeNull();
    expect(nightCounts(runsDir, 'not-a-date')).toBeNull();
    expect(nightCounts(tempRuns('2026-10-30', ''), '2026-10-30')).toEqual({
      ok: 0,
      retry: 0,
      fail: 0,
    });
  });
});
