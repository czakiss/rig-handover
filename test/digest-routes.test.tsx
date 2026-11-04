import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow } from '../src/digest/types.js';

// runs/ is read-only fixtures (AGENTS.md): every test writes its own night
// into a throwaway dir and points the app at it through config.runsDir.
const dirs: string[] = [];

// An app whose runsDir is a fresh temp dir holding the given files
// (keyed by file name, e.g. '2026-10-30.jsonl').
function appFor(files: Record<string, string>) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  dirs.push(runsDir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(runsDir, name), content, 'utf8');
  }
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

// A normal night: two jobs, folded into two rows sorted by job.
const goodNight =
  [
    '{"at":"2026-10-30T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
    '{"at":"2026-10-30T23:30:00+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
    '{"at":"2026-10-30T23:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  ].join('\n') + '\n';

// A bad line among good ones: the truncated 'broken' line is counted and
// skipped, never thrown - the good rows must still render.
const badLineNight =
  [
    '{"at":"2026-10-31T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
    '{"at":"2026-10-31T23:15:00+01:00","job":"broken","status":"ok"',
    '{"at":"2026-10-31T23:00:01+01:00","job":"notes/backup","status":"ok","owner":"lane-07"}',
  ].join('\n') + '\n';

describe('GET /digest/:night (page)', () => {
  it('renders a night on disk as a table of rows', async () => {
    const app = appFor({ '2026-10-30.jsonl': goodNight });
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<table');
    expect(html).toContain('<td>lane/sync</td>');
    expect(html).toContain('<td>notes/backup</td>');
  });

  it('answers 404 for a night with no file', async () => {
    const app = appFor({ '2026-10-30.jsonl': goodNight });
    const res = await app.request('/digest/1999-12-31');
    expect(res.status).toBe(404);
  });

  it("renders 'nothing ran' for an empty night", async () => {
    const app = appFor({ '2026-11-01.jsonl': '' });
    const res = await app.request('/digest/2026-11-01');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('still renders the good rows when a line is bad', async () => {
    const app = appFor({ '2026-10-31.jsonl': badLineNight });
    const res = await app.request('/digest/2026-10-31');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<td>lane/sync</td>');
    expect(html).toContain('<td>notes/backup</td>');
    expect(html).not.toContain('broken'); // the bad line never becomes a row
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('answers 200 with the folded rows for a night on disk', async () => {
    const app = appFor({ '2026-10-30.jsonl': goodNight });
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const rows = (await res.json()) as DigestRow[];
    expect(rows.map((row) => row.job)).toEqual(['lane/sync', 'notes/backup']);
    expect(rows.find((row) => row.job === 'lane/sync')).toMatchObject({
      owner: 'rook',
      runs: 2,
      retries: 1,
      // the retry is the job's last line: lastStatus comes from it
      lastStatus: 'retry',
      lastError: 'lock held',
    });
  });

  it('answers 404 for a night with no file', async () => {
    const app = appFor({ '2026-10-30.jsonl': goodNight });
    const res = await app.request('/api/digest/1999-12-31');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no runs for this night' });
  });

  it('answers 200 with an empty array for an empty night', async () => {
    const app = appFor({ '2026-11-01.jsonl': '' });
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('answers 200 with only the good rows when a line is bad', async () => {
    const app = appFor({ '2026-10-31.jsonl': badLineNight });
    const res = await app.request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    const rows = (await res.json()) as DigestRow[];
    expect(rows.map((row) => row.job)).toEqual(['lane/sync', 'notes/backup']);
  });
});
