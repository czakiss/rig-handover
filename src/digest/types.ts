// The stable surface of the digest feature (plan.md § 1): every other part of
// the plan codes against this module only. DigestRow is the row shape;
// ReadNight is the reader's signature. The reader itself lives in
// ./readNight.ts - import readNight from there.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job, for one night. Times are the log's `at` strings kept
// verbatim - offset included, never converted to UTC. Missing data stays
// null here; only the view renders it as an em dash.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// readNight(runsDir, night) folds runs/<night>.jsonl (`night` is the bare
// date, e.g. '2026-10-28') into rows sorted by job:
//
// - runs: every parsed line of the job; retries: its 'retry' lines.
// - lastStatus / lastAt / owner: from the job's last parsed line (a null
//   owner is kept, not dropped); firstAt: from its first.
// - lastError: from the job's last parsed line that carries one, else null.
//
// Contract:
// - Missing file -> null (the routes turn that into a 404); empty file ->
//   []. A night that doesn't match /^\d{4}-\d{2}-\d{2}$/ is treated the same
//   as a missing file. Other read errors (permissions, ...) still throw.
// - A line that is not a log line - bad JSON, or JSON whose at / job is not
//   a string, whose status is not ok | retry | fail, or whose owner / error
//   has the wrong type - is counted in NightLog.badLines and skipped, never
//   thrown: the night still renders. Unknown extra fields are fine; blank
//   lines are ignored.
export type ReadNight = (runsDir: string, night: string) => DigestRow[] | null;

// The same read, keeping the bad-line count reachable. readNight() is
// readNightLog().rows - they can never disagree.
export type NightLog = {
  rows: DigestRow[];
  badLines: number;
};

export type ReadNightLog = (runsDir: string, night: string) => NightLog | null;
