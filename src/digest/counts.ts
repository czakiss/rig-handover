import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readNightLog } from './readNight.js';
import type { RunStatus } from './types.js';

// Line-level status counts for one night, for the board's link (plan.md § 2c).
// The rows fold per job, so they cannot answer "how many lines were ok?" -
// this counts every parsed line by its own status, per line, not per row.
// Bad lines are skipped like readNightLog skips them; the night still renders.
export type NightCounts = Record<RunStatus, number>;

// nightCounts(runsDir, night) re-reads runs/<night>.jsonl with the same
// parsing rules as readNightLog: missing file -> null, empty file -> zeros,
// bad lines counted nowhere, never thrown.
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  const log = readNightLog(runsDir, night);
  if (log === null) {
    return null;
  }

  // The reader folds rows but discards the per-line statuses, so the counts
  // come from the raw file: same read, same parse, one pass over the lines.
  const text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  const statuses: ReadonlySet<string> = new Set(['ok', 'retry', 'fail']);
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const { status, at, job, owner, error } = value as Record<string, unknown>;
    const isLine =
      typeof at === 'string' &&
      typeof job === 'string' &&
      typeof status === 'string' &&
      statuses.has(status) &&
      (owner === null || typeof owner === 'string') &&
      (error === undefined || error === null || typeof error === 'string');
    if (isLine) {
      counts[status as RunStatus] += 1;
    }
  }
  return counts;
}
