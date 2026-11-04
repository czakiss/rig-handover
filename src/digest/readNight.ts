import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightLog, RunStatus } from './types.js';

const NIGHT_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: ReadonlySet<string> = new Set(['ok', 'retry', 'fail']);

// One parsed line of runs/<night>.jsonl. `at` is kept verbatim - offset
// included, never converted to UTC.
type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

// Parse at the edge: anything not shaped like a log line is a bad line,
// counted and skipped - never thrown. Unknown extra fields are fine.
function parseLine(raw: string): LogLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const line = value as Record<string, unknown>;
  const { at, job, status, owner, error } = line;
  if (typeof at !== 'string' || typeof job !== 'string') {
    return null;
  }
  if (typeof status !== 'string' || !STATUSES.has(status)) {
    return null;
  }
  if (owner !== null && typeof owner !== 'string') {
    return null;
  }
  if (error !== undefined && error !== null && typeof error !== 'string') {
    return null;
  }
  return { at, job, status: status as RunStatus, owner, error: error ?? null };
}

// readNight(runsDir, night): the rows alone. readNightLog keeps the
// bad-line count too; this is just its .rows.
export function readNight(runsDir: string, night: string): DigestRow[] | null {
  return readNightLog(runsDir, night)?.rows ?? null;
}

// readNightLog(runsDir, night) folds runs/<night>.jsonl into one row per
// job: missing file -> null, empty file -> { rows: [], badLines: 0 }, bad
// lines counted, never thrown.
export function readNightLog(runsDir: string, night: string): NightLog | null {
  if (!NIGHT_RE.test(night)) {
    return null;
  }
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') {
      continue;
    }
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    let row = byJob.get(line.job);
    if (row === undefined) {
      row = {
        job: line.job,
        owner: null,
        runs: 0,
        retries: 0,
        lastStatus: line.status,
        lastError: null,
        firstAt: line.at,
        lastAt: line.at,
      };
      byJob.set(line.job, row);
    }
    row.runs += 1;
    if (line.status === 'retry') {
      row.retries += 1;
    }
    row.owner = line.owner;
    row.lastStatus = line.status;
    row.lastAt = line.at;
    if (line.error !== null) {
      row.lastError = line.error;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job));
  return { rows, badLines };
}
