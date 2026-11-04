import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/readNight.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import { DigestPage } from './views/digest.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  // The same rows as the page (plan.md § 2b): one readNight, so the two can
  // never disagree (ADR 0001). Missing night -> 404; empty file -> [].
  app.get('/api/digest/:night', (c) => {
    const rows = readNight(config.runsDir, c.req.param('night'));
    if (rows === null) {
      return c.json({ error: 'no runs for this night' }, 404);
    }
    return c.json(rows);
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  // Plan § 2a: readNight folds the night; null (no file) is a 404, an empty
  // night renders 'nothing ran'. Sorting is readNight's contract, not the route's.
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const rows = readNight(config.runsDir, night);
    if (rows === null) {
      return c.notFound();
    }
    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={night} rows={rows} />
      </Layout>,
    );
  });

  return app;
}
