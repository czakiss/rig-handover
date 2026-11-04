import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight, readNightLog } from '../src/digest/readNight.js';

// runs/ is read-only fixtures (AGENTS.md): every test writes its own night
// into a throwaway dir.
const dirs: string[] = [];

function tempRuns(night: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  dirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), content, 'utf8');
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe('readNight', () => {
  it('folds the real 2026-10-28 night into 5 rows sorted by job, with 1 bad line counted', () => {
    // A copy of runs/2026-10-28.jsonl (runs/ itself is read-only): 15 good
    // lines over 5 jobs, plus one truncated line at the end.
    const src = readFileSync('runs/2026-10-28.jsonl', 'utf8');
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    dirs.push(runsDir);
    cpSync('runs/2026-10-28.jsonl', join(runsDir, '2026-10-28.jsonl'));

    const rows = readNight(runsDir, '2026-10-28');
    expect(src).toContain('digest/render'); // sanity: we read the fixture

    // done-when: 5 jobs, 1 bad line
    expect(readNightLog(runsDir, '2026-10-28')?.badLines).toBe(1);
    expect(rows).not.toBeNull();
    expect(rows?.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const laneSync = rows?.find((r) => r.job === 'lane/sync');
    expect(laneSync).toMatchObject({
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });

    const fixtures = rows?.find((r) => r.job === 'fixtures/refresh');
    expect(fixtures).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      // the last line with an error was a retry: lastError survives the ok
      lastError: 'upstream 503',
    });

    const notes = rows?.find((r) => r.job === 'notes/backup');
    expect(notes).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });

    expect(rows?.find((r) => r.job === 'rig/rotate-logs')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      lastStatus: 'ok',
      lastError: null,
    });
  });

  it('counts the bad line, never throws: the night still renders', () => {
    const runsDir = tempRuns(
      '2026-10-28',
      [
        '{"at":"2026-10-28T23:00:01+01:00","job":"a/one","status":"ok","owner":"rook"}',
        '{"at":"2026-10-28T23:00:02+01:00","job":"a/one","status":"ok","owner":"rook"',
        '{"at":"2026-10-28T23:00:03+01:00","job":"a/one","status":"ok","owner":"rook"}',
      ].join('\n') + '\n',
    );
    const log = readNightLog(runsDir, '2026-10-28');
    expect(log).not.toBeNull();
    expect(log?.badLines).toBe(1);
    expect(log?.rows).toHaveLength(1);
    expect(log?.rows[0]).toMatchObject({ job: 'a/one', runs: 2 });
  });

  it('keeps the row when owner is null', () => {
    const runsDir = tempRuns(
      '2026-10-30',
      '{"at":"2026-10-30T23:00:00+01:00","job":"digest/render","status":"ok","owner":null}\n',
    );
    const rows = readNight(runsDir, '2026-10-30');
    expect(rows).toEqual([
      {
        job: 'digest/render',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-30T23:00:00+01:00',
        lastAt: '2026-10-30T23:00:00+01:00',
      },
    ]);
  });

  it('treats lines with the wrong shape as bad lines too', () => {
    const runsDir = tempRuns(
      '2026-10-30',
      [
        '{"at":"2026-10-30T23:00:00+01:00","job":"a/ok","status":"ok","owner":"rook"}',
        '{"at":"2026-10-30T23:00:01+01:00","job":"a/bad-status","status":"weird","owner":"rook"}',
        '{"at":"2026-10-30T23:00:02+01:00","job":42,"status":"ok","owner":"rook"}',
        '["not","an","object"]',
      ].join('\n') + '\n',
    );
    const log = readNightLog(runsDir, '2026-10-30');
    expect(log?.badLines).toBe(3);
    expect(log?.rows).toHaveLength(1);
    expect(log?.rows[0].job).toBe('a/ok');
  });

  it('returns null for a night with no file (routes 404 on this)', () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    dirs.push(runsDir);
    expect(readNight(runsDir, '1999-12-31')).toBeNull();
    expect(readNightLog(runsDir, '1999-12-31')).toBeNull();
  });

  it('returns [] for an empty night', () => {
    const runsDir = tempRuns('2026-10-30', '');
    expect(readNight(runsDir, '2026-10-30')).toEqual([]);
  });
});
